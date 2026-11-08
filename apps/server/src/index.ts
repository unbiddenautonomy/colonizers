import { ENGINE_VERSION } from '@colonizers/engine';
import type { Env } from './env.ts';

export { GameRoom } from './room.ts';

const ROOM_ID = /^[a-z0-9-]{1,40}$/;

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

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (roomMatch) {
      const roomId = decodeURIComponent(roomMatch[1] ?? '').toLowerCase();
      if (!ROOM_ID.test(roomId)) {
        return json({ error: 'Room id must be 1-40 letters, digits or dashes' }, { status: 400 });
      }
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ error: 'Expected a WebSocket upgrade' }, { status: 426 });
      }
      const stub = env.ROOMS.getByName(roomId);
      const headers = new Headers(request.headers);
      headers.set('X-Room-Id', roomId);
      return stub.fetch(new Request(request, { headers }));
    }

    return json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
