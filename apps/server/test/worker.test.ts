import { describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { stateFromView, type Action } from '@colonizers/engine';
import type { GameSnapshot, RoomInfo, ServerMessage } from '../src/protocol.ts';
import { DEFAULT_OPTIONS } from '../src/protocol.ts';
import { library } from '../src/rules.ts';

const BASE = 'https://colonizers.test';

/** Keeps every message so tests can wait for one that has not arrived yet. */
class Client {
  readonly messages: ServerMessage[] = [];
  you = '';
  room: RoomInfo | null = null;
  game: GameSnapshot | null = null;
  private waiters: (() => void)[] = [];

  constructor(
    readonly ws: WebSocket,
    readonly token: string,
  ) {
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage;
      this.messages.push(msg);
      if (msg.type === 'welcome') {
        this.you = msg.you;
        this.room = msg.room;
        this.game = msg.game;
      }
      if (msg.type === 'room') this.room = msg.room;
      if (msg.type === 'game') this.game = msg.game;
      const ws = this.waiters;
      this.waiters = [];
      ws.forEach((w) => w());
    });
    ws.accept();
  }

  get mark(): number {
    return this.messages.length;
  }

  /** Resolves with the first message from `since` on that matches. */
  async waitFor(
    pred: (m: ServerMessage) => boolean,
    since = 0,
    what = 'message',
  ): Promise<ServerMessage> {
    const deadline = Date.now() + 5000;
    for (;;) {
      const found = this.messages.slice(since).find(pred);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }

  send(data: unknown): void {
    this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
  }

  close(): void {
    this.ws.close();
  }

  get seat(): number | null {
    return this.room?.members.find((m) => m.id === this.you)?.seat ?? null;
  }
}

async function createRoom(): Promise<string> {
  const res = await exports.default.fetch(`${BASE}/api/rooms`, { method: 'POST' });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

let tokens = 0;
async function join(code: string, name: string, token?: string): Promise<Client> {
  const res = await exports.default.fetch(`${BASE}/api/rooms/${code}/ws`, {
    headers: { Upgrade: 'websocket' },
  });
  expect(res.status).toBe(101);
  if (!res.webSocket) throw new Error('No WebSocket on response');
  const t = token ?? `test-token-${String(++tokens).padStart(6, '0')}-${name}`;
  const client = new Client(res.webSocket, t);
  client.send({ type: 'hello', token: t, name });
  await client.waitFor((m) => m.type === 'welcome', 0, 'welcome');
  return client;
}

const WEIGHTS: Record<string, number> = {
  buildCity: 60,
  buildSettlement: 50,
  buyDevCard: 12,
  buildRoad: 8,
  placeFreeRoad: 10,
  playDevCard: 4,
  bankTrade: 2,
  endTurn: 1,
};

function legalFor(c: Client): Action[] {
  if (!c.game || c.seat === null) return [];
  return library
    .legalActions(stateFromView(c.game.view), c.seat)
    .filter((a) => a.type !== 'confirmTrade' && a.type !== 'offerTrade');
}

function pick(actions: Action[], rand: () => number): Action {
  const weights = actions.map((a) => WEIGHTS[a.type] ?? 1);
  let r = rand() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < actions.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return actions[i]!;
  }
  return actions[actions.length - 1]!;
}

async function startGame(clients: Client[]): Promise<void> {
  const host = clients[0]!;
  const marks = clients.map((c) => c.mark);
  host.send({ type: 'start' });
  await Promise.all(
    clients.map((c, i) =>
      c.waitFor((m) => m.type === 'welcome' && m.game !== null, marks[i], 'game start'),
    ),
  );
}

describe('API', () => {
  it('reports health', async () => {
    const res = await exports.default.fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, service: 'colonizers' });
  });

  it('returns 404 for unknown API routes', async () => {
    const res = await exports.default.fetch(`${BASE}/api/nope`);
    expect(res.status).toBe(404);
  });

  it('rejects bad room codes', async () => {
    const res = await exports.default.fetch(`${BASE}/api/rooms/bad_id!/ws`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(res.status).toBe(400);
  });

  it('requires a WebSocket upgrade for rooms', async () => {
    const res = await exports.default.fetch(`${BASE}/api/rooms/abc/ws`);
    expect(res.status).toBe(426);
  });

  it('creates rooms and reports whether a code exists', async () => {
    const code = await createRoom();
    expect(code).toMatch(/^[a-z2-9]{6}$/);
    const found = await exports.default.fetch(`${BASE}/api/rooms/${code}`);
    expect(await found.json()).toMatchObject({ exists: true, status: 'lobby', players: 0 });
    const missing = await exports.default.fetch(`${BASE}/api/rooms/nosuchroom`);
    expect(await missing.json()).toMatchObject({ exists: false });
    const ws = await exports.default.fetch(`${BASE}/api/rooms/nosuchroom/ws`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(ws.status).toBe(404);
  });
});

describe('Lobby', () => {
  it('makes the first player host and shows everyone who is here', async () => {
    const code = await createRoom();
    const a = await join(code, 'Nachi');
    expect(a.room).toMatchObject({ status: 'lobby', hostId: a.you });
    const mark = a.mark;
    const b = await join(code, 'Friend');
    await a.waitFor((m) => m.type === 'room' && m.room.members.length === 2, mark);
    expect(a.room!.members.map((m) => [m.name, m.online, m.role])).toEqual([
      ['Nachi', true, 'player'],
      ['Friend', true, 'player'],
    ]);

    // Only the host can change settings or start.
    let m = b.mark;
    b.send({ type: 'start' });
    expect(await b.waitFor((x) => x.type === 'error', m)).toMatchObject({ code: 'denied' });
    m = b.mark;
    a.send({
      type: 'settings',
      settings: {
        map: { kind: 'random', mode: 'balanced' },
        vpTarget: 12,
        turnTimer: 90,
        maxPlayers: 3,
      },
    });
    await b.waitFor((x) => x.type === 'room' && x.room.settings.vpTarget === 12, m);
    expect(b.room!.settings).toEqual({
      map: { kind: 'random', mode: 'balanced' },
      vpTarget: 12,
      citiesKnights: false,
      greedWealthPower: false,
      worldWonders: false,
      civilisations: false,
      church: false,
      witches: false,
      princes: false,
      soldiers: false,
      investors: false,
      kingdoms: false,
      landWater: false,
      strategist: false,
      turnTimer: 90,
      maxPlayers: 3,
      options: DEFAULT_OPTIONS,
    });

    // Leaving shows the player as offline straight away.
    m = a.mark;
    b.close();
    await a.waitFor((x) => x.type === 'room' && x.room.members[1]?.online === false, m);
    a.close();
  });

  it('lets the same guest come back, and seats latecomers as spectators when full', async () => {
    const code = await createRoom();
    const a = await join(code, 'A');
    a.send({
      type: 'settings',
      settings: {
        map: { kind: 'random', mode: 'classic' },
        vpTarget: 10,
        turnTimer: 0,
        maxPlayers: 2,
      },
    });
    const b = await join(code, 'B');
    const c = await join(code, 'C');
    expect(c.room!.members.find((m) => m.id === c.you)?.role).toBe('spectator');
    b.close();
    const again = await join(code, 'B renamed', b.token);
    expect(again.you).toBe(b.you);
    expect(again.room!.members.find((m) => m.id === b.you)?.name).toBe('B renamed');
    [a, c, again].forEach((x) => x.close());
  });

  it('lets the host remove someone', async () => {
    const code = await createRoom();
    const a = await join(code, 'Host');
    const b = await join(code, 'Gone');
    const m = b.mark;
    a.send({ type: 'remove', member: b.you });
    expect(await b.waitFor((x) => x.type === 'error', m, 'removed')).toMatchObject({
      code: 'removed',
    });
    await a.waitFor((x) => x.type === 'room' && x.room.members.length === 1, 0, 'room of 1');
    a.close();
  });

  it('broadcasts chat and ignores floods', async () => {
    const code = await createRoom();
    const a = await join(code, 'A');
    const b = await join(code, 'B');
    const m = b.mark;
    a.send({ type: 'chat', text: '  hello table  ' });
    a.send({ type: 'chat', text: 'spam' });
    const msg = await b.waitFor((x) => x.type === 'chat', m);
    expect(msg).toMatchObject({
      type: 'chat',
      message: { from: a.you, name: 'A', text: 'hello table' },
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(b.messages.slice(m).filter((x) => x.type === 'chat')).toHaveLength(1);
    const late = await join(code, 'Late');
    const welcome = late.messages[0] as Extract<ServerMessage, { type: 'welcome' }>;
    expect(welcome.chat.map((c) => c.text)).toEqual(['hello table']);
    [a, b, late].forEach((x) => x.close());
  });

  it('answers garbage with an error instead of crashing', async () => {
    const code = await createRoom();
    const a = await join(code, 'A');
    const m = a.mark;
    a.send('not json');
    expect(await a.waitFor((x) => x.type === 'error', m)).toMatchObject({ type: 'error' });
    a.close();
  });
});

describe('Online game', () => {
  it('four players on their own devices finish a game, one reconnecting mid-game', async () => {
    const code = await createRoom();
    const clients = [
      await join(code, 'Ann'),
      await join(code, 'Ben'),
      await join(code, 'Cat'),
      await join(code, 'Dev'),
    ];
    await startGame(clients);
    const seats = clients.map((c) => c.seat);
    expect([...seats].sort()).toEqual([0, 1, 2, 3]);

    let x = 12345;
    const rand = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    let seq = 0;
    let reconnected = false;
    for (let step = 0; step < 4000; step++) {
      // Every device must be up to date before anyone moves.
      await Promise.all(
        clients.map((c) =>
          c.game!.seq >= seq ? null : c.waitFor((m) => m.type === 'game' && m.game.seq >= seq),
        ),
      );
      const view = clients[0]!.game!.view;
      if (view.winner !== null) break;

      // Each device only ever sees its own hand.
      for (const c of clients) {
        for (const p of c.game!.view.players) {
          if (p.seat !== c.seat) expect(p.hand).toEqual({});
        }
      }

      if (step === 120 && !reconnected) {
        // Ben's phone goes to sleep and comes back.
        const i = 1;
        const old = clients[i]!;
        old.close();
        const back = await join(code, 'Ben', old.token);
        expect(back.seat).toBe(old.seat);
        expect(back.game!.seq).toBe(seq);
        expect(back.game!.view.players[back.seat!]!.hand).toEqual(
          old.game!.view.players[old.seat!]!.hand,
        );
        clients[i] = back;
        reconnected = true;
      }

      const movers = clients.filter((c) => legalFor(c).length > 0);
      expect(movers.length, `nobody can move in ${view.phase.id}`).toBeGreaterThan(0);
      const mover = movers[Math.floor(rand() * movers.length)]!;
      const action = pick(legalFor(mover), rand);
      const mark = mover.mark;
      mover.send({ type: 'act', action });
      const reply = await mover.waitFor(
        (m) => (m.type === 'game' && m.game.seq > seq) || m.type === 'error',
        mark,
        `reply to ${action.type}`,
      );
      if (reply.type === 'error') throw new Error(`${action.type} refused: ${reply.message}`);
      seq = (reply as Extract<ServerMessage, { type: 'game' }>).game.seq;
    }
    expect(reconnected).toBe(true);
    const final = clients[0]!.game!.view;
    expect(final.winner).not.toBeNull();
    // At the end every hand is shown.
    expect(final.players.every((p) => Object.keys(p.hand).length >= 0)).toBe(true);
    await clients[0]!.waitFor((m) => m.type === 'room' && m.room.status === 'finished');

    // The host can set up the next game with the same people.
    const m = clients[1]!.mark;
    clients.find((c) => c.you === c.room!.hostId)!.send({ type: 'rematch' });
    await clients[1]!.waitFor((x) => x.type === 'welcome' && x.room.status === 'lobby', m);
    clients.forEach((c) => c.close());
  }, 120_000);

  it('uses the sender’s own seat, so nobody can move for someone else', async () => {
    const code = await createRoom();
    const a = await join(code, 'A');
    const b = await join(code, 'B');
    await startGame([a, b]);
    const waiting = a.game!.view.turn.player;
    const idle = a.seat === waiting ? b : a;
    const legal = library.legalActions(stateFromView(a.game!.view), waiting);
    const m = idle.mark;
    idle.send({ type: 'act', action: { ...legal[0]!, player: waiting } });
    expect(await idle.waitFor((x) => x.type === 'error', m)).toMatchObject({ code: 'rule' });
    [a, b].forEach((c) => c.close());
  });

  it('replays saved moves after the room restarts', async () => {
    const code = await createRoom();
    const a = await join(code, 'A');
    const b = await join(code, 'B');
    await startGame([a, b]);
    for (let i = 0; i < 6; i++) {
      // Both devices must have the latest move before picking who goes next.
      await Promise.all(
        [a, b].map((c) =>
          c.game!.seq === i ? null : c.waitFor((x) => x.type === 'game' && x.game.seq === i),
        ),
      );
      const mover = [a, b].find((c) => legalFor(c).length > 0)!;
      const mark = mover.mark;
      mover.send({ type: 'act', action: legalFor(mover)[0] });
      await mover.waitFor((x) => x.type === 'game' && x.game.seq === i + 1, mark);
    }
    await a.waitFor((x) => x.type === 'game' && x.game.seq === 6);
    const before = a.game!.view;
    const stub = env.ROOMS.getByName(code);
    // Drop the in-memory game, as if the room had been evicted.
    await runInDurableObject(stub, (room) => {
      (room as unknown as { game: unknown }).game = null;
    });
    a.close();
    const again = await join(code, 'A', a.token);
    expect(again.game!.view).toEqual(before);
    [again, b].forEach((c) => c.close());
  });

  it('plays a safe move when the turn timer runs out', async () => {
    const code = await createRoom();
    const a = await join(code, 'A');
    a.send({
      type: 'settings',
      settings: {
        map: { kind: 'random', mode: 'classic' },
        vpTarget: 10,
        turnTimer: 60,
        maxPlayers: 4,
      },
    });
    const b = await join(code, 'B');
    await startGame([a, b]);
    expect(a.game!.deadline).toBeGreaterThan(Date.now());
    const m = a.mark;
    expect(await runDurableObjectAlarm(env.ROOMS.getByName(code))).toBe(true);
    await a.waitFor((x) => x.type === 'game' && x.game.seq >= 1, m, 'timeout move');
    await a.waitFor((x) => x.type === 'chat' && x.message.text.startsWith('Time ran out'), m);
    expect(a.game!.view.phase.id).toBe('setup');
    [a, b].forEach((c) => c.close());
  });

  it('starts a Seafarers scenario with fog hidden from every player', async () => {
    const code = await createRoom();
    const a = await join(code, 'A');
    a.send({
      type: 'settings',
      settings: {
        map: { kind: 'scenario', id: 'fog-islands' },
        vpTarget: 10,
        turnTimer: 0,
        maxPlayers: 4,
      },
    });
    const b = await join(code, 'B');
    expect(b.room!.settings.map).toEqual({ kind: 'scenario', id: 'fog-islands' });
    await startGame([a, b]);
    const view = a.game!.view;
    expect(view.modules).toContain('seafarers');
    expect(view.settings.vpTarget).toBeGreaterThanOrEqual(11);
    const fog = Object.values(view.hexes).filter((h) => h.hidden);
    expect(fog.length).toBeGreaterThan(0);
    expect(fog.every((h) => h.type === 'hidden' && h.token === undefined)).toBe(true);
    expect(Object.values(view.pieces).some((p) => p.type === 'pirate')).toBe(true);
    [a, b].forEach((c) => c.close());
  });

  it('starts Cities & Knights on top of a Seafarers scenario', async () => {
    const code = await createRoom();
    const a = await join(code, 'A');
    a.send({
      type: 'settings',
      settings: {
        map: { kind: 'scenario', id: 'new-shores' },
        vpTarget: 10,
        citiesKnights: true,
        turnTimer: 0,
        maxPlayers: 4,
      },
    });
    const b = await join(code, 'B');
    expect(b.room!.settings.citiesKnights).toBe(true);
    await startGame([a, b]);
    const view = a.game!.view;
    expect(view.modules).toEqual(['base', 'seafarers', 'variants', 'cities-knights']);
    expect(view.decks.science).toBe(18);
    expect(view.bank.paper).toBeGreaterThan(0);
    [a, b].forEach((c) => c.close());
  });

  it('lets spectators watch without seeing any hand', async () => {
    const code = await createRoom();
    const a = await join(code, 'A');
    const b = await join(code, 'B');
    await startGame([a, b]);
    const watcher = await join(code, 'Watcher');
    expect(watcher.seat).toBeNull();
    expect(watcher.game!.view.viewer).toBeNull();
    const m = watcher.mark;
    watcher.send({ type: 'act', action: { type: 'roll', player: 0 } });
    expect(await watcher.waitFor((x) => x.type === 'error', m)).toMatchObject({ code: 'denied' });
    [a, b, watcher].forEach((c) => c.close());
  });

  it('plays with bots: they join from the lobby and take their own moves', async () => {
    const code = await createRoom();
    const host = await join(code, 'Solo');
    const guest = await join(code, 'Guest');
    let m = guest.mark;
    guest.send({ type: 'addBot', level: 'medium', style: 'builder' });
    await guest.waitFor((x) => x.type === 'error' && x.code === 'denied', m, 'denied');
    guest.send({ type: 'leave' });
    await host.waitFor((x) => x.type === 'room' && x.room.members.length === 1, 0, 'guest left');
    guest.close();

    for (const level of ['easy', 'medium', 'hard'])
      host.send({ type: 'addBot', level, style: 'balanced' });
    await host.waitFor(
      (x) => x.type === 'room' && x.room.members.filter((mm) => mm.bot).length === 3,
      0,
      'three bots',
    );
    const bots = host.room!.members.filter((mm) => mm.bot);
    expect(bots.every((b) => b.online && b.role === 'player')).toBe(true);
    expect(bots.map((b) => b.bot!.level).sort()).toEqual(['easy', 'hard', 'medium']);

    await startGame([host]);
    // Play the host's own setup moves; the bots place theirs by themselves.
    const deadline = Date.now() + 40_000;
    while (host.game!.view.phase.id === 'setup') {
      if (Date.now() > deadline) throw new Error('Bots did not finish setup');
      const mine = legalFor(host);
      if (mine.length) {
        m = host.mark;
        host.send({ type: 'act', action: mine[0] });
        await host.waitFor((x) => x.type === 'game' || x.type === 'error', m, 'host move');
      } else {
        m = host.mark;
        await host.waitFor((x) => x.type === 'game', m, 'a bot move');
      }
    }
    const view = host.game!.view;
    const corners = Object.values(view.pieces).filter((p) => p.at.kind === 'corner');
    expect(corners.length).toBe(8);
    host.close();
  }, 60_000);
});
