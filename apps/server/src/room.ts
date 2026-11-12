import { DurableObject } from 'cloudflare:workers';
import {
  RuleError,
  type Action,
  type GameConfig,
  type GameEvent,
  type GameState,
  Ctx,
} from '@colonizers/engine';
import { botName, chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import { accounts, USER_HEADER } from './auth.ts';
import type { Env } from './env.ts';
import {
  cleanSettings,
  DEFAULT_SETTINGS,
  mapKey,
  parseClientMessage,
  type ChatMessage,
  type ClientMessage,
  type GameSnapshot,
  type LogEntry,
  type MemberInfo,
  type RoomInfo,
  type RoomSettings,
  type RoomStatus,
  type ServerMessage,
} from './protocol.ts';
import { buildConfig, library, timedSeats, timeoutAction, timerKey } from './rules.ts';

const LOG_KEPT = 400;
const LOG_SENT_ON_JOIN = 250;
const CHAT_SENT_ON_JOIN = 60;
const CHAT_GAP_MS = 600;
const NUDGE_GAP_MS = 20_000;
/** Pause between bot moves, so people can follow them. */
const BOT_DELAY_MS = 700;
/** How long Hard bots may think about one move. */
const BOT_BUDGET_MS = 2500;
const MAX_BOTS = 7;

interface Member {
  id: string;
  token: string;
  name: string;
  role: 'player' | 'spectator';
  seat: number | null;
  joined: number;
  /** The account behind this seat, when the player is signed in. */
  userId: string | null;
  /** Set for computer players. */
  bot: BotConfig | null;
}

interface Attachment {
  memberId: string | null;
  /** Signed-in account, from the Worker. */
  userId?: string | null;
}

interface LiveGame {
  config: GameConfig;
  state: GameState;
  /** Recent events with their visibility, filtered per player when sent. */
  log: LogEntry[];
}

export interface RoomSummary {
  exists: boolean;
  status: RoomStatus | null;
  players: number;
  maxPlayers: number;
}

/**
 * One Durable Object per game room. It holds the lobby, every player's
 * WebSockets, and the authoritative game. Each move is checked with the shared
 * engine and saved as one row, so the game survives restarts and hibernation:
 * on wake-up the room replays the saved moves from the seed.
 */
export class GameRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  private readonly members = new Map<string, Member>();
  private game: LiveGame | null = null;
  private readonly lastChat = new Map<string, number>();
  private readonly lastNudge = new Map<string, number>();
  private readonly botMemory = new Map<string, BotMemory>();
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        seat INTEGER,
        joined INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS actions (seq INTEGER PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member TEXT,
        name TEXT NOT NULL,
        text TEXT NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS played (
        game_id TEXT NOT NULL,
        member TEXT NOT NULL,
        seat INTEGER NOT NULL,
        PRIMARY KEY (game_id, seat)
      );
    `);
    for (const column of ['user_id TEXT', 'bot TEXT']) {
      try {
        this.sql.exec(`ALTER TABLE members ADD COLUMN ${column}`);
      } catch {
        // Already there.
      }
    }
    for (const m of this.sql.exec<
      Omit<Member, 'bot'> & { bot: string | null } & Record<string, SqlStorageValue>
    >(
      'SELECT id, token, name, role, seat, joined, user_id AS userId, bot FROM members ORDER BY joined',
    )) {
      this.members.set(m.id, { ...m, bot: m.bot ? (JSON.parse(m.bot) as BotConfig) : null });
    }
  }

  // ---- Called by the Worker ----

  /** Sets up a new room. Returns false if the code is already taken. */
  async create(code: string): Promise<boolean> {
    if (this.getMeta('code')) return false;
    this.setMeta('code', code);
    this.setMeta('status', 'lobby');
    this.setMeta('settings', JSON.stringify(DEFAULT_SETTINGS));
    return true;
  }

  async summary(): Promise<RoomSummary> {
    if (!this.getMeta('code')) return { exists: false, status: null, players: 0, maxPlayers: 0 };
    return {
      exists: true,
      status: this.status,
      players: this.players().length,
      maxPlayers: this.settings.maxPlayers,
    };
  }

  /**
   * A guest who signs in later: the seat behind this token joins their
   * account, with every game it played here. Returns how many games moved.
   */
  async claim(token: string, userId: string): Promise<number> {
    if (!this.getMeta('code')) return 0;
    const member = [...this.members.values()].find((m) => m.token === token);
    if (!member || (member.userId && member.userId !== userId)) return 0;
    return this.linkUser(member, userId);
  }

  override async fetch(request: Request): Promise<Response> {
    if (!this.getMeta('code')) return Response.json({ error: 'Room not found' }, { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      memberId: null,
      userId: request.headers.get(USER_HEADER),
    } satisfies Attachment);
    // The client says who it is in its first message ("hello").
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- WebSocket events ----

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const msg = parseClientMessage(raw);
    if (!msg) return this.send(ws, { type: 'error', message: 'Unknown message' });
    if (msg.type === 'hello') return this.hello(ws, msg.token, msg.name);
    const member = this.memberOf(ws);
    if (!member) return this.send(ws, { type: 'error', message: 'Say hello first' });
    this.handle(ws, member, msg);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'closing');
    } catch {
      // Already closed.
    }
    if (this.memberOf(ws)) this.broadcastRoom(ws);
  }

  override async alarm(): Promise<void> {
    if (this.status !== 'playing') return;
    this.scheduleBots();
    const game = this.load();
    if (!game) return;
    const expired = timerKey(game.state);
    const rand = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
    // Play safe moves until the stalled step is over (at most a few).
    const timedOut = new Set<number>();
    for (let i = 0; i < 12 && game.state.winner === null; i++) {
      if (timerKey(game.state) !== expired) break;
      const seat = timedSeats(game.state).find((s) => timeoutAction(game.state, s, rand));
      if (seat === undefined) break;
      timedOut.add(seat);
      this.applyAction(timeoutAction(game.state, seat, rand)!);
    }
    for (const seat of timedOut) {
      this.systemChat(`Time ran out for ${game.state.players[seat]?.name ?? 'a player'}.`);
    }
    this.updateTimer(timedOut.size > 0);
  }

  // ---- Messages ----

  private hello(ws: WebSocket, token: string, name: string): void {
    const userId = (ws.deserializeAttachment() as Attachment | null)?.userId ?? null;
    const all = [...this.members.values()];
    // A signed-in player gets their seat on any device; otherwise the device token decides.
    let member =
      (userId ? all.find((m) => m.userId === userId) : undefined) ??
      all.find((m) => m.token === token);
    if (member && userId && !member.userId) this.linkUser(member, userId);
    if (!member) {
      const room = this.status === 'lobby' && this.players().length < this.settings.maxPlayers;
      member = {
        id: crypto.randomUUID().slice(0, 8),
        token,
        name,
        role: room ? 'player' : 'spectator',
        seat: null,
        joined: Date.now(),
        userId,
        bot: null,
      };
      this.members.set(member.id, member);
      this.sql.exec(
        'INSERT INTO members (id, token, name, role, seat, joined, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        member.id,
        token,
        name,
        member.role,
        null,
        member.joined,
        userId,
      );
      if (!this.getMeta('host')) this.setMeta('host', member.id);
    } else if (this.status === 'lobby' && member.name !== name) {
      this.rename(member, name);
    }
    ws.serializeAttachment({ memberId: member.id, userId } satisfies Attachment);
    this.sendWelcome(ws);
    this.broadcastRoom();
    // After a restart the room wakes on a message; let the bots carry on.
    this.scheduleBots();
  }

  private handle(ws: WebSocket, member: Member, msg: ClientMessage): void {
    const isHost = this.getMeta('host') === member.id;
    const deny = (message: string) => this.send(ws, { type: 'error', message, code: 'denied' });
    switch (msg.type) {
      case 'rename':
        if (this.status !== 'lobby') return deny('Names are fixed once the game starts');
        this.rename(member, msg.name);
        return this.broadcastRoom();
      case 'settings': {
        if (!isHost) return deny('Only the host can change settings');
        if (this.status !== 'lobby') return deny('The game has already started');
        const settings = cleanSettings(msg.settings);
        settings.maxPlayers = Math.max(settings.maxPlayers, this.players().length);
        this.setMeta('settings', JSON.stringify(settings));
        return this.broadcastRoom();
      }
      case 'start':
        if (!isHost) return deny('Only the host can start the game');
        if (this.status !== 'lobby') return deny('The game has already started');
        if (this.players().length < 2) return deny('You need at least 2 players');
        return this.start();
      case 'remove': {
        if (!isHost) return deny('Only the host can remove players');
        if (this.status !== 'lobby') return deny('Players can only be removed in the lobby');
        const target = this.members.get(msg.member);
        if (!target || target.id === member.id) return;
        return this.removeMember(target, 'The host removed you from this room');
      }
      case 'addBot': {
        if (!isHost) return deny('Only the host can add bots');
        if (this.status !== 'lobby') return deny('Bots can only join in the lobby');
        if (this.players().length >= this.settings.maxPlayers) return deny('The table is full');
        if ([...this.members.values()].filter((m) => m.bot).length >= MAX_BOTS)
          return deny('That is enough bots');
        this.addBot({ level: msg.level, style: msg.style });
        return this.broadcastRoom();
      }
      case 'leave':
        if (this.status !== 'lobby' && member.seat !== null)
          return deny('Your seat stays yours until the game ends');
        return this.removeMember(member, 'You left the room');
      case 'act':
        return this.act(ws, member, msg.action);
      case 'chat': {
        const now = Date.now();
        if (now - (this.lastChat.get(member.id) ?? 0) < CHAT_GAP_MS) return;
        this.lastChat.set(member.id, now);
        return this.chat(member.id, member.name, msg.text);
      }
      case 'nudge': {
        const game = this.load();
        const target = game?.state.players[msg.seat];
        if (!target) return;
        const now = Date.now();
        if (now - (this.lastNudge.get(member.id) ?? 0) < NUDGE_GAP_MS)
          return deny('You can nudge again in a few seconds');
        this.lastNudge.set(member.id, now);
        return this.systemChat(`${member.name} nudged ${target.name}.`);
      }
      case 'rematch':
        if (!isHost) return deny('Only the host can set up the next game');
        if (this.status !== 'finished') return deny('The game is still going');
        return this.backToLobby();
    }
  }

  private start(): void {
    const players = this.players();
    // Shuffle seats so nobody always goes first.
    const order = [...players];
    for (let i = order.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    order.forEach((m, seat) => {
      m.seat = seat;
      this.sql.exec('UPDATE members SET seat = ? WHERE id = ?', seat, m.id);
    });
    const seed = crypto.randomUUID();
    const config = buildConfig(
      this.settings,
      order.map((m) => m.name),
      seed,
    );
    this.sql.exec('DELETE FROM actions');
    this.setMeta('config', JSON.stringify(config));
    this.setMeta('status', 'playing');
    const gameId = `${this.getMeta('code') ?? 'room'}-${seed.slice(0, 8)}`;
    this.setMeta('gameId', gameId);
    order.forEach((m, seat) =>
      this.sql.exec(
        'INSERT OR REPLACE INTO played (game_id, member, seat) VALUES (?, ?, ?)',
        gameId,
        m.id,
        seat,
      ),
    );
    this.background(
      accounts(this.env).recordGame({
        id: gameId,
        room: this.getMeta('code') ?? '',
        modules: config.modules,
        map: mapKey(this.settings.map),
        players: order.map((m, seat) => ({
          seat,
          name: m.name,
          userId: m.userId,
          bot: m.bot?.level ?? null,
        })),
      }),
    );
    this.game = null;
    this.load();
    this.updateTimer();
    this.sendWelcomeToAll();
    this.scheduleBots();
  }

  private act(ws: WebSocket, member: Member, raw: Action): void {
    if (this.status !== 'playing') {
      return this.send(ws, { type: 'error', message: 'No game is running', code: 'denied' });
    }
    if (member.seat === null) {
      return this.send(ws, { type: 'error', message: 'Spectators can watch only', code: 'denied' });
    }
    try {
      this.applyAction({ ...raw, player: member.seat });
    } catch (e) {
      if (e instanceof RuleError) {
        return this.send(ws, { type: 'error', message: e.message, code: 'rule' });
      }
      throw e;
    }
    this.updateTimer();
  }

  /** Applies, saves and sends one move. Throws RuleError if it is illegal. */
  private applyAction(action: Action): void {
    const game = this.load();
    if (!game) throw new RuleError('No game is running');
    const r = library.apply(game.state, action);
    game.state = r.state;
    this.sql.exec(
      'INSERT INTO actions (seq, json) VALUES (?, ?)',
      r.state.seq,
      JSON.stringify(action),
    );
    const entries = r.events.map((event) => ({ seq: r.state.seq, event }));
    game.log.push(...entries);
    if (game.log.length > LOG_KEPT) game.log.splice(0, game.log.length - LOG_KEPT);
    this.broadcastGame(entries);
    this.scheduleBots();
    if (r.state.winner !== null) {
      const gameId = this.getMeta('gameId');
      if (gameId) {
        const ctx = new Ctx(r.state, library.registry(r.state.modules));
        const vp = r.state.players.map((_, seat) => ctx.vp(seat));
        const actions = this.sql
          .exec<{ json: string }>('SELECT json FROM actions ORDER BY seq')
          .toArray()
          .map((row) => JSON.parse(row.json) as Action);
        this.background(
          accounts(this.env)
            .finishGame(gameId, r.state.winner, vp, { config: game.config, actions })
            .then((unlocked) => {
              if (!unlocked.length) return;
              for (const ws of this.ctx.getWebSockets())
                if (this.memberOf(ws)) this.send(ws, { type: 'achievements', unlocked });
            }),
        );
      }
      this.setMeta('status', 'finished');
      this.broadcastRoom();
    }
  }

  private backToLobby(): void {
    this.sql.exec('DELETE FROM actions');
    this.deleteMeta('config');
    this.deleteMeta('deadline');
    this.deleteMeta('timerKey');
    this.setMeta('status', 'lobby');
    this.game = null;
    let players = 0;
    for (const m of this.members.values()) {
      m.seat = null;
      m.role = players < this.settings.maxPlayers ? 'player' : 'spectator';
      if (m.role === 'player') players++;
      this.sql.exec('UPDATE members SET seat = NULL, role = ? WHERE id = ?', m.role, m.id);
    }
    void this.ctx.storage.deleteAlarm();
    this.sendWelcomeToAll();
  }

  private addBot(config: BotConfig): void {
    const taken = [...this.members.values()].map((m) => m.name);
    const bot: Member = {
      id: crypto.randomUUID().slice(0, 8),
      token: `bot-${crypto.randomUUID().replace(/-/g, '')}`,
      name: botName(taken),
      role: 'player',
      seat: null,
      joined: Date.now(),
      userId: null,
      bot: config,
    };
    this.members.set(bot.id, bot);
    this.sql.exec(
      'INSERT INTO members (id, token, name, role, seat, joined, user_id, bot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      bot.id,
      bot.token,
      bot.name,
      bot.role,
      null,
      bot.joined,
      null,
      JSON.stringify(config),
    );
  }

  // ---- Bots ----

  /** Lets bots take their next move after a short pause. Safe to call often. */
  private scheduleBots(delay = BOT_DELAY_MS): void {
    if (this.botTimer || this.status !== 'playing') return;
    if (![...this.members.values()].some((m) => m.bot && m.seat !== null)) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.runBot();
    }, delay);
  }

  private runBot(): void {
    const game = this.status === 'playing' ? this.load() : null;
    if (!game || game.state.winner !== null) return;
    const bySeat = new Map<number, Member>();
    for (const m of this.members.values()) if (m.bot && m.seat !== null) bySeat.set(m.seat, m);
    const waiting = library.waitingOn(game.state).filter((s) => bySeat.has(s));
    for (const seat of waiting) {
      const m = bySeat.get(seat)!;
      if (!this.botMemory.has(m.id)) this.botMemory.set(m.id, newMemory());
      let action;
      try {
        action = chooseAction(library, game.state, seat, m.bot!, this.botMemory.get(m.id), {
          budgetMs: BOT_BUDGET_MS,
        });
      } catch (e) {
        console.error('Bot failed to choose', e);
        action = null;
      }
      if (!action) continue;
      try {
        this.applyAction(action);
      } catch (e) {
        console.error('Bot move refused', action.type, e);
        continue;
      }
      this.updateTimer();
      this.scheduleBots();
      return;
    }
    // A bot waiting on answers to its trade offer looks again in a while.
    if (waiting.length) this.scheduleBots(4000);
  }

  /** Ties a seat to an account, including the games it already played here. */
  private linkUser(member: Member, userId: string): number {
    member.userId = userId;
    this.sql.exec('UPDATE members SET user_id = ? WHERE id = ?', userId, member.id);
    const games = this.sql
      .exec<{ game_id: string; seat: number }>(
        'SELECT game_id, seat FROM played WHERE member = ?',
        member.id,
      )
      .toArray();
    for (const g of games)
      this.background(accounts(this.env).attachPlayer(g.game_id, g.seat, userId));
    return games.length;
  }

  /** Account bookkeeping must never break the game, so failures are only logged. */
  private background(work: Promise<unknown>): void {
    this.ctx.waitUntil(work.catch((e: unknown) => console.error('Accounts call failed', e)));
  }

  private rename(member: Member, name: string): void {
    member.name = name;
    this.sql.exec('UPDATE members SET name = ? WHERE id = ?', name, member.id);
  }

  private removeMember(member: Member, reason: string): void {
    this.members.delete(member.id);
    this.sql.exec('DELETE FROM members WHERE id = ?', member.id);
    if (this.getMeta('host') === member.id) {
      const next = [...this.members.values()].find((m) => !m.bot);
      if (next) this.setMeta('host', next.id);
      else this.deleteMeta('host');
    }
    // A spectator moves up into a free seat.
    const waiting = [...this.members.values()].find((m) => m.role === 'spectator');
    if (waiting && this.status === 'lobby' && this.players().length < this.settings.maxPlayers) {
      waiting.role = 'player';
      this.sql.exec("UPDATE members SET role = 'player' WHERE id = ?", waiting.id);
    }
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment | null)?.memberId !== member.id) continue;
      this.send(ws, { type: 'error', message: reason, code: 'removed' });
      ws.serializeAttachment(null);
      ws.close(4001, 'removed');
    }
    this.broadcastRoom();
  }

  private chat(from: string | null, name: string, text: string): void {
    const at = Date.now();
    this.sql.exec(
      'INSERT INTO chat (member, name, text, at) VALUES (?, ?, ?, ?)',
      from,
      name,
      text,
      at,
    );
    const id = this.sql.exec<{ id: number }>('SELECT last_insert_rowid() AS id').one().id;
    const message: ChatMessage = { id, from, name, text, at };
    for (const ws of this.ctx.getWebSockets()) {
      if (this.memberOf(ws)) this.send(ws, { type: 'chat', message });
    }
  }

  private systemChat(text: string): void {
    this.chat(null, 'Room', text);
  }

  // ---- Turn timer ----

  private updateTimer(force = false): void {
    const game = this.status === 'playing' ? this.load() : null;
    if (!game || this.settings.turnTimer === 0 || game.state.winner !== null) {
      if (this.getMeta('deadline')) {
        this.deleteMeta('deadline');
        void this.ctx.storage.deleteAlarm();
      }
      return;
    }
    const key = timerKey(game.state);
    if (!force && key === this.getMeta('timerKey')) return;
    const deadline = Date.now() + this.settings.turnTimer * 1000;
    this.setMeta('timerKey', key);
    this.setMeta('deadline', String(deadline));
    void this.ctx.storage.setAlarm(deadline);
    // Tell everyone about the new deadline.
    this.broadcastGame([]);
  }

  // ---- Loading ----

  /** The running game, replayed from saved moves after a restart. */
  private load(): LiveGame | null {
    if (this.game) return this.game;
    const raw = this.getMeta('config');
    if (!raw) return null;
    const config = JSON.parse(raw) as GameConfig;
    const created = library.createGame(config);
    let state = created.state;
    const log: LogEntry[] = created.events.map((event) => ({ seq: 0, event }));
    for (const row of this.sql.exec<{ json: string }>('SELECT json FROM actions ORDER BY seq')) {
      const r = library.apply(state, JSON.parse(row.json) as Action);
      state = r.state;
      for (const event of r.events) log.push({ seq: state.seq, event });
    }
    if (log.length > LOG_KEPT) log.splice(0, log.length - LOG_KEPT);
    this.game = { config, state, log };
    return this.game;
  }

  // ---- Sending ----

  private snapshot(seat: number | null): GameSnapshot | null {
    const game = this.status === 'lobby' ? null : this.load();
    if (!game) return null;
    const deadline = this.getMeta('deadline');
    return {
      view: library.view(game.state, seat),
      seq: game.state.seq,
      deadline: deadline ? Number(deadline) : null,
    };
  }

  private visibleLog(entries: LogEntry[], seat: number | null): LogEntry[] {
    const out: LogEntry[] = [];
    for (const e of entries) {
      for (const event of library.viewEvents([e.event], seat) as GameEvent[]) {
        out.push({ seq: e.seq, event });
      }
    }
    return out;
  }

  private sendWelcome(ws: WebSocket): void {
    const member = this.memberOf(ws);
    if (!member) return;
    const seat = member.seat;
    const game = this.snapshot(seat);
    const chat = this.sql
      .exec<ChatMessage & Record<string, SqlStorageValue>>(
        'SELECT id, member AS "from", name, text, at FROM chat ORDER BY id DESC LIMIT ?',
        CHAT_SENT_ON_JOIN,
      )
      .toArray()
      .reverse()
      .map((c) => ({ ...c }));
    this.send(ws, {
      type: 'welcome',
      you: member.id,
      room: this.roomInfo(),
      game,
      log: game && this.game ? this.visibleLog(this.game.log.slice(-LOG_SENT_ON_JOIN), seat) : [],
      chat,
      now: Date.now(),
    });
  }

  private sendWelcomeToAll(): void {
    for (const ws of this.ctx.getWebSockets()) this.sendWelcome(ws);
  }

  private broadcastGame(entries: LogEntry[]): void {
    const bySeat = new Map<number | null, ServerMessage>();
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const member = this.memberOf(ws);
      if (!member) continue;
      let msg = bySeat.get(member.seat);
      if (!msg) {
        const game = this.snapshot(member.seat);
        if (!game) continue;
        msg = { type: 'game', game, events: this.visibleLog(entries, member.seat), now };
        bySeat.set(member.seat, msg);
      }
      this.send(ws, msg);
    }
  }

  private broadcastRoom(closing?: WebSocket): void {
    const room = this.roomInfo(closing);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== closing && this.memberOf(ws)) this.send(ws, { type: 'room', room });
    }
  }

  private roomInfo(closing?: WebSocket): RoomInfo {
    const online = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const m = ws !== closing ? this.memberOf(ws) : null;
      if (m) online.add(m.id);
    }
    const members: MemberInfo[] = [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      seat: m.seat,
      role: m.role,
      online: !!m.bot || online.has(m.id),
      ...(m.bot ? { bot: m.bot } : {}),
    }));
    return {
      code: this.getMeta('code') ?? '',
      status: this.status,
      hostId: this.getMeta('host'),
      settings: this.settings,
      members,
    };
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket already closed; webSocketClose cleans up.
    }
  }

  // ---- Helpers ----

  private memberOf(ws: WebSocket): Member | null {
    const att = ws.deserializeAttachment() as Attachment | null;
    return att?.memberId ? (this.members.get(att.memberId) ?? null) : null;
  }

  private players(): Member[] {
    return [...this.members.values()].filter((m) => m.role === 'player');
  }

  private get status(): RoomStatus {
    return (this.getMeta('status') as RoomStatus | null) ?? 'lobby';
  }

  private get settings(): RoomSettings {
    const raw = this.getMeta('settings');
    return raw ? cleanSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  }

  private getMeta(key: string): string | null {
    const rows = this.sql
      .exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)
      .toArray();
    return rows[0]?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.sql.exec('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  }

  private deleteMeta(key: string): void {
    this.sql.exec('DELETE FROM meta WHERE key = ?', key);
  }
}
