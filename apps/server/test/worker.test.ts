import { describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import type { ServerMessage } from '../src/protocol.ts';

const BASE = 'https://colonizers.test';

/** Buffers every message so none are lost between awaits. */
class Client {
  private readonly queue: ServerMessage[] = [];
  private waiter: ((m: ServerMessage) => void) | null = null;

  constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage;
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = null;
        w(msg);
      } else {
        this.queue.push(msg);
      }
    });
    ws.accept();
  }

  next(): Promise<ServerMessage> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => (this.waiter = resolve));
  }

  send(data: unknown): void {
    this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
  }

  close(): void {
    this.ws.close();
  }
}

async function openRoom(roomId: string): Promise<{ client: Client; welcome: ServerMessage }> {
  const res = await exports.default.fetch(`${BASE}/api/rooms/${roomId}/ws`, {
    headers: { Upgrade: 'websocket' },
  });
  expect(res.status).toBe(101);
  if (!res.webSocket) throw new Error('No WebSocket on response');
  const client = new Client(res.webSocket);
  return { client, welcome: await client.next() };
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

  it('rejects bad room ids', async () => {
    const res = await exports.default.fetch(`${BASE}/api/rooms/bad_id!/ws`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(res.status).toBe(400);
  });

  it('requires a WebSocket upgrade for rooms', async () => {
    const res = await exports.default.fetch(`${BASE}/api/rooms/abc/ws`);
    expect(res.status).toBe(426);
  });
});

describe('GameRoom', () => {
  it('welcomes a player with an empty history', async () => {
    const { client, welcome } = await openRoom('welcome-room');
    expect(welcome).toMatchObject({ type: 'welcome', roomId: 'welcome-room', seq: 0, history: [] });
    client.close();
  });

  it('broadcasts rolls to everyone in the room with increasing seq', async () => {
    const a = (await openRoom('broadcast-room')).client;
    const b = (await openRoom('broadcast-room')).client;
    expect(await a.next()).toMatchObject({ type: 'presence', online: 2 });

    a.send({ type: 'roll', name: 'Nachi' });
    const [ma, mb] = await Promise.all([a.next(), b.next()]);
    expect(ma).toEqual(mb);
    if (ma.type !== 'rolled') throw new Error(`Expected rolled, got ${ma.type}`);
    expect(ma.event.seq).toBe(1);
    expect(ma.event.name).toBe('Nachi');
    expect(ma.event.total).toBe(ma.event.dice[0] + ma.event.dice[1]);

    b.send({ type: 'roll', name: 'Friend' });
    const second = await b.next();
    expect(second.type === 'rolled' && second.event.seq).toBe(2);
    a.close();
    b.close();
  });

  it('lets a client catch up on missed events', async () => {
    const stub = env.ROOMS.getByName('sync-room');
    await runInDurableObject(stub, (room) => {
      room.roll('A');
      room.roll('B');
      room.roll('C');
    });
    const { client, welcome } = await openRoom('sync-room');
    expect(welcome).toMatchObject({ type: 'welcome', seq: 3 });
    client.send({ type: 'sync', afterSeq: 1 });
    const msg = await client.next();
    if (msg.type !== 'events') throw new Error(`Expected events, got ${msg.type}`);
    expect(msg.events.map((e) => e.seq)).toEqual([2, 3]);
    client.close();
  });

  it('answers garbage with an error instead of crashing', async () => {
    const { client } = await openRoom('garbage-room');
    client.send('not json');
    expect(await client.next()).toMatchObject({ type: 'error' });
    client.close();
  });

  it('keeps the RNG state in storage so rolls survive restarts', async () => {
    const stub = env.ROOMS.getByName('rng-room');
    const state = await runInDurableObject(stub, (room, ctx) => {
      room.roll('A');
      return ctx.storage.sql
        .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'rng'")
        .one().value;
    });
    expect(JSON.parse(state)).toHaveLength(4);
  });
});
