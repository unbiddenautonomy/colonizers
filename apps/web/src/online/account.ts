import { useSyncExternalStore } from 'react';
import { MODES, PRESETS, SEA_SCENARIOS, SPECIAL_MAPS } from '@colonizers/maps';
import type {
  CrewDetail,
  CrewSummary,
  GlobalLeaderboard,
  HistoryGame,
  LeaderRow,
  MyStats,
  Prefs,
  PublicUser,
  Replay,
  SiteSettings,
} from '../../../server/src/accountTypes.ts';
import { saveName, savedName, visitedRooms } from './identity.ts';
import { AUTO, DEFAULT_LOOK, lookPick, LOOKS, setForcedLook, setLook } from '../theme/looks.tsx';
import { onPrefPicked } from '../theme/prefs.ts';
import { DEFAULT_THEME, setForcedTheme, setTheme, themePick, THEMES } from '../theme/themes.tsx';
import {
  customDice,
  DEFAULT_CUSTOM_DICE,
  dicePick,
  isDiceSkin,
  parseCustomDice,
  setCustomDice,
  setDiceSkin,
} from '../ui/Dice.tsx';

export type {
  CrewDetail,
  CrewSummary,
  GlobalLeaderboard,
  HistoryGame,
  LeaderRow,
  MyStats,
  PublicUser,
  Replay,
  SiteSettings,
};

export const AVATARS = ['🦊', '🐻', '🦉', '🐢', '🐙', '🦁', '🐺', '🦄', '🐝', '🐳', '🦜', '🐸'];

/** Calls one of our JSON endpoints. Throws an Error with the server's message. */
async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again.');
  return data;
}

// ---- Site-wide look, set by an admin ----

/** Fetches the admin's site-wide look, if any, and applies it. */
export async function loadSite(): Promise<SiteSettings> {
  const r = await call<{ site: SiteSettings }>('/api/site').catch(() => ({
    site: { look: null, board: null },
  }));
  setForcedLook(r.site.look);
  setForcedTheme(r.site.board);
  return r.site;
}

export async function saveSite(site: SiteSettings): Promise<SiteSettings> {
  const r = await call<{ site: SiteSettings }>('/api/site', 'PATCH', site);
  setForcedLook(r.site.look);
  setForcedTheme(r.site.board);
  return r.site;
}

// ---- Signed-in user, shared by every screen ----

interface AccountState {
  loaded: boolean;
  user: PublicUser | null;
  google: boolean;
}

let state: AccountState = { loaded: false, user: null, google: false };
const listeners = new Set<() => void>();

function set(next: Partial<AccountState>): void {
  state = { ...state, ...next };
  if (state.user) syncPrefs(state.user);
  else syncedFor = null;
  for (const l of listeners) l();
}

// ---- Look, board and dice saved with the account ----

let syncedFor: string | null = null;

/**
 * Once per sign-in: the account's saved look, board and dice show on this
 * device, and any the account hasn't saved yet are taken from this device.
 */
function syncPrefs(user: PublicUser): void {
  if (syncedFor === user.id) return;
  syncedFor = user.id;
  const saved = user.prefs;
  if (saved.look && (saved.look === AUTO || LOOKS.some((l) => l.id === saved.look)))
    setLook(saved.look);
  if (saved.board && THEMES.some((t) => t.id === saved.board)) setTheme(saved.board);
  const design = parseCustomDice(saved.diceFaces);
  if (design) setCustomDice(design);
  if (saved.dice && isDiceSkin(saved.dice)) setDiceSkin(saved.dice);
  const missing: Partial<Prefs> = {};
  if (!saved.look && lookPick() !== DEFAULT_LOOK) missing.look = lookPick();
  if (!saved.board && themePick() !== DEFAULT_THEME.id) missing.board = themePick();
  if (!saved.dice && dicePick() !== 'classic') missing.dice = dicePick();
  if (!saved.diceFaces && customDice() !== DEFAULT_CUSTOM_DICE)
    missing.diceFaces = JSON.stringify(customDice());
  if (Object.keys(missing).length) void savePrefs(missing);
}

async function savePrefs(prefs: Partial<Prefs>): Promise<void> {
  const r = await call<{ user: PublicUser }>('/api/me', 'PATCH', { prefs }).catch(() => null);
  if (r && state.user?.id === r.user.id) set({ user: r.user });
}

// A pick while signed in follows the player to their other devices.
onPrefPicked((picked) => {
  if (state.user) void savePrefs(picked);
});

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let loading: Promise<void> | null = null;

export function loadAccount(): Promise<void> {
  loading ??= Promise.all([
    call<{ user: PublicUser | null }>('/api/me').catch(() => ({ user: null })),
    call<{ google: boolean }>('/api/auth/config').catch(() => ({ google: false })),
  ]).then(([me, config]) => set({ loaded: true, user: me.user, google: config.google }));
  return loading;
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function currentUser(): PublicUser | null {
  return state.user;
}

/** After signing in: use the account's name, and move this device's guest seats to the account. */
async function signedIn(user: PublicUser): Promise<PublicUser> {
  set({ user, loaded: true });
  if (!savedName()) saveName(user.name);
  const rooms = visitedRooms();
  if (rooms.length) await call('/api/me/claim', 'POST', { rooms }).catch(() => undefined);
  return user;
}

export async function signUp(email: string, password: string, name: string) {
  const r = await call<{ user: PublicUser }>('/api/auth/signup', 'POST', { email, password, name });
  return signedIn(r.user);
}

export async function logIn(email: string, password: string) {
  const r = await call<{ user: PublicUser }>('/api/auth/login', 'POST', { email, password });
  return signedIn(r.user);
}

export async function logOut(): Promise<void> {
  await call('/api/auth/logout', 'POST', {});
  set({ user: null });
}

/** Deletes the account for good and signs this browser out. */
export async function deleteAccount(): Promise<void> {
  await call('/api/me/delete', 'POST', {});
  set({ user: null });
}

/** Full-page redirect through Google; comes back to `returnTo`. */
export function googleSignInUrl(returnTo: string): string {
  return `/api/auth/google?return=${encodeURIComponent(returnTo)}`;
}

/** Called when the page loads after coming back from Google. */
export async function afterGoogle(): Promise<void> {
  loading = null;
  await loadAccount();
  if (state.user) await signedIn(state.user);
}

export async function verifyEmail(token: string): Promise<void> {
  await call('/api/auth/verify', 'POST', { token });
  if (state.user) set({ user: { ...state.user, emailVerified: true } });
}

export async function resendVerify(): Promise<void> {
  await call('/api/auth/resend-verify', 'POST', {});
}

export async function forgotPassword(email: string): Promise<void> {
  await call('/api/auth/forgot', 'POST', { email });
}

export async function resetPassword(token: string, password: string) {
  const r = await call<{ user: PublicUser }>('/api/auth/reset', 'POST', { token, password });
  return signedIn(r.user);
}

export async function updateProfile(fields: {
  name?: string;
  avatar?: string;
  onLeaderboard?: boolean;
}) {
  const r = await call<{ user: PublicUser }>('/api/me', 'PATCH', fields);
  set({ user: r.user });
  saveName(r.user.name);
  return r.user;
}

export async function setPassword(current: string, password: string): Promise<void> {
  await call('/api/me/password', 'POST', { current, password });
  if (state.user) set({ user: { ...state.user, hasPassword: true } });
}

export async function history(): Promise<HistoryGame[]> {
  return (await call<{ games: HistoryGame[] }>('/api/me/history')).games;
}

export async function myStats(): Promise<MyStats> {
  return (await call<{ stats: MyStats }>('/api/me/stats')).stats;
}

export async function getReplay(gameId: string): Promise<Replay> {
  return (await call<{ replay: Replay }>(`/api/games/${encodeURIComponent(gameId)}/replay`)).replay;
}

/** Everyone's results in games with at least two signed-in players. */
export async function globalLeaderboard(): Promise<GlobalLeaderboard> {
  return (await call<{ leaderboard: GlobalLeaderboard }>('/api/leaderboard')).leaderboard;
}

// ---- Crews ----

export async function myCrews(): Promise<CrewSummary[]> {
  return (await call<{ crews: CrewSummary[] }>('/api/crews')).crews;
}

export async function createCrew(name: string): Promise<CrewSummary> {
  return (await call<{ crew: CrewSummary }>('/api/crews', 'POST', { name })).crew;
}

export async function crewDetail(id: string): Promise<CrewDetail> {
  return (await call<{ crew: CrewDetail }>(`/api/crews/${encodeURIComponent(id)}`)).crew;
}

export async function crewByInvite(invite: string) {
  return (
    await call<{ crew: { id: string; name: string; members: number } }>(
      `/api/crews/invite/${encodeURIComponent(invite)}`,
    )
  ).crew;
}

export async function joinCrew(invite: string): Promise<CrewSummary> {
  return (await call<{ crew: CrewSummary }>('/api/crews/join', 'POST', { invite })).crew;
}

export async function leaveCrew(id: string): Promise<void> {
  await call(`/api/crews/${encodeURIComponent(id)}/leave`, 'POST', {});
}

export async function renewInvite(id: string): Promise<string> {
  return (await call<{ invite: string }>(`/api/crews/${encodeURIComponent(id)}/invite`, 'POST', {}))
    .invite;
}

export function crewInviteLink(invite: string): string {
  return `${window.location.origin}/?crew=${invite}`;
}

const MODULE_NAMES: Record<string, string> = {
  seafarers: 'Seafarers',
  'cities-knights': 'Cities & Knights',
};

export function describeModules(modules: string[]): string {
  const extra = modules.filter((m) => MODULE_NAMES[m]).map((m) => MODULE_NAMES[m]!);
  return extra.length ? extra.join(' + ') : 'Base game';
}

/** A friendly name for a saved map key such as "special:volcano". */
export function mapName(key: string | null): string {
  if (!key || key === 'unknown') return 'Older game';
  const [kind, id = ''] = key.split(':');
  // The same wording the setup screen uses, so a game is named the same way
  // wherever it is listed: "Classic (random)", not "Random board".
  if (kind === 'random')
    return id in MODES ? `${MODES[id as keyof typeof MODES].name} (random)` : 'Random board';
  if (kind === 'custom') return `Custom map (${id})`;
  const list: { id: string; name: string }[] =
    kind === 'preset' ? PRESETS : kind === 'scenario' ? SEA_SCENARIOS : SPECIAL_MAPS;
  return list.find((m) => m.id === id)?.name ?? id;
}
