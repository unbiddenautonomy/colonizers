import { ENGINE_VERSION } from '@colonizers/engine';
import type { Env } from './env.ts';

import { ROOM_CODE } from './protocol.ts';

export { GameRoom } from './room.ts';

const CODE_LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789';

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init?.headers },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'colonizers', engine: ENGINE_VERSION });
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        if (await env.ROOMS.getByName(code).create(code)) return json({ code }, { status: 201 });
      }
      return json({ error: 'Could not find a free room code' }, { status: 503 });
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/ws)?$/);
    if (roomMatch) {
      const code = decodeURIComponent(roomMatch[1] ?? '').toLowerCase();
      if (!ROOM_CODE.test(code)) {
        return json({ error: 'Room codes are letters, digits or dashes' }, { status: 400 });
      }
      const stub = env.ROOMS.getByName(code);
      if (!roomMatch[2]) {
        if (request.method !== 'GET') return json({ error: 'Method not allowed' }, { status: 405 });
        return json(await stub.summary());
      }
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ error: 'Expected a WebSocket upgrade' }, { status: 426 });
      }
      return stub.fetch(request);
    }

    return json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
