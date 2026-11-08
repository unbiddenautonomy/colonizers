import { DurableObject } from 'cloudflare:workers';
import { Rng, rollDice, type RngState } from '@colonizers/engine';
import type { Env } from './env.ts';
import { parseClientMessage, type RollEvent, type ServerMessage } from './protocol.ts';

const HISTORY_SENT_ON_JOIN = 20;

/**
 * One Durable Object per game room. It keeps the authoritative state in its
 * own SQLite database and holds every player's WebSocket. It uses the
 * hibernation API, so an idle room costs nothing.
 *
 * In phase 0 this is a test room: anyone connected can roll dice, every roll
 * gets a sequence number, and clients that missed events can catch up.
 */
export class GameRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        d1 INTEGER NOT NULL,
        d2 INTEGER NOT NULL,
        at INTEGER NOT NULL
      );
    `);
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    const roomId = request.headers.get('X-Room-Id') ?? 'unknown';
    this.setMeta('roomId', roomId);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);

    const seq = this.lastSeq();
    this.send(server, {
      type: 'welcome',
      roomId,
      seq,
      history: this.eventsAfter(seq - HISTORY_SENT_ON_JOIN),
      online: this.ctx.getWebSockets().length,
    });
    this.broadcast({ type: 'presence', online: this.ctx.getWebSockets().length }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const msg = parseClientMessage(raw);
    if (!msg) {
      this.send(ws, { type: 'error', message: 'Unknown message' });
      return;
    }
    if (msg.type === 'sync') {
      this.send(ws, { type: 'events', events: this.eventsAfter(msg.afterSeq) });
      return;
    }
    const event = this.roll(msg.name);
    this.broadcast({ type: 'rolled', event });
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code === 1005 ? 1000 : code, 'closing');
    this.broadcast({ type: 'presence', online: this.ctx.getWebSockets().length - 1 }, ws);
  }

  /** Rolls with the room's seeded RNG and appends the result to the event log. */
  roll(name: string): RollEvent {
    const rng = this.loadRng();
    const { dice, total } = rollDice(rng);
    this.setMeta('rng', JSON.stringify(rng.getState()));
    const seq = this.lastSeq() + 1;
    const at = Date.now();
    this.sql.exec(
      'INSERT INTO events (seq, name, d1, d2, at) VALUES (?, ?, ?, ?, ?)',
      seq,
      name,
      dice[0],
      dice[1],
      at,
    );
    return { seq, name, dice: [dice[0], dice[1]], total, at };
  }

  private loadRng(): Rng {
    const saved = this.getMeta('rng');
    if (saved) return Rng.fromState(JSON.parse(saved) as RngState);
    const seed = crypto.randomUUID();
    this.setMeta('seed', seed);
    return Rng.fromSeed(seed);
  }

  private lastSeq(): number {
    const row = this.sql.exec<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM events').one();
    return row.seq ?? 0;
  }

  private eventsAfter(afterSeq: number): RollEvent[] {
    return this.sql
      .exec<{ seq: number; name: string; d1: number; d2: number; at: number }>(
        'SELECT seq, name, d1, d2, at FROM events WHERE seq > ? ORDER BY seq',
        afterSeq,
      )
      .toArray()
      .map((r) => ({ seq: r.seq, name: r.name, dice: [r.d1, r.d2], total: r.d1 + r.d2, at: r.at }));
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

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket already closed; it will be cleaned up by webSocketClose.
    }
  }

  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) this.send(ws, msg);
    }
  }
}
