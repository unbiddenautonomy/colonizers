/** Guest identity: a secret token per room and a display name, kept on this device. */

const NAME_KEY = 'colonizers.name';
const TOKENS_KEY = 'colonizers.roomTokens';
const DEVICE_KEY = 'colonizers.deviceToken';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the seat still works until the tab closes.
  }
}

export function newToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

const memoryTokens: Record<string, string> = {};

export function savedName(): string {
  return read(NAME_KEY) ?? '';
}

export function saveName(name: string): void {
  write(NAME_KEY, name);
}

function tokens(): Record<string, string> {
  try {
    return { ...(JSON.parse(read(TOKENS_KEY) ?? '{}') as Record<string, string>), ...memoryTokens };
  } catch {
    return { ...memoryTokens };
  }
}

/** This device's token for a room. A seat link from another device can set it. */
export function tokenFor(code: string): string {
  const all = tokens();
  if (all[code]) return all[code];
  let device = read(DEVICE_KEY);
  if (!device) {
    device = newToken();
    write(DEVICE_KEY, device);
  }
  return device;
}

export function setTokenFor(code: string, token: string): void {
  memoryTokens[code] = token;
  write(TOKENS_KEY, JSON.stringify({ ...tokens(), [code]: token }));
}

/**
 * A seat link opens the same seat on another device (phone and laptop at once).
 * The token rides in the URL fragment, which browsers never send to the server.
 */
export function seatLink(code: string, token: string): string {
  return `${window.location.origin}/r/${code}#seat=${token}`;
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/r/${code}`;
}

/** Picks up a seat token from the address bar, then removes it from view. */
export function adoptSeatFromUrl(code: string): void {
  const m = window.location.hash.match(/seat=([A-Za-z0-9_-]{16,64})/);
  if (!m?.[1]) return;
  setTokenFor(code, m[1]);
  window.history.replaceState(null, '', window.location.pathname);
}

const VISITED_KEY = 'colonizers.visitedRooms';

/** Rooms this device joined, so its guest seats can move to an account after sign-in. */
export function rememberRoom(code: string): void {
  const list = visitedCodes().filter((c) => c !== code);
  list.unshift(code);
  write(VISITED_KEY, JSON.stringify(list.slice(0, 50)));
}

function visitedCodes(): string[] {
  try {
    const v: unknown = JSON.parse(read(VISITED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

export function visitedRooms(): { code: string; token: string }[] {
  return visitedCodes().map((code) => ({ code, token: tokenFor(code) }));
}
