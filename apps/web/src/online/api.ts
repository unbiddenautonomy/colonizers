export interface RoomSummary {
  exists: boolean;
  status: 'lobby' | 'playing' | 'finished' | null;
  players: number;
  maxPlayers: number;
}

export async function createRoom(): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error('Could not create a room. Try again in a moment.');
  return ((await res.json()) as { code: string }).code;
}

export async function roomSummary(code: string): Promise<RoomSummary> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (!res.ok) return { exists: false, status: null, players: 0, maxPlayers: 0 };
  return (await res.json()) as RoomSummary;
}

export function roomSocketUrl(code: string, location: Location = window.location): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/api/rooms/${encodeURIComponent(code)}/ws`;
}

/** Turns what someone typed or pasted (a code or a whole link) into a room code. */
export function parseRoomCode(input: string): string | null {
  const s = input.trim().toLowerCase();
  const fromLink = s.match(/\/r\/([a-z0-9-]{1,40})/);
  const code = fromLink?.[1] ?? s;
  return /^[a-z0-9-]{1,40}$/.test(code) ? code : null;
}
