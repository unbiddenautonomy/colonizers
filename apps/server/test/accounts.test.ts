import { describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import type {
  CrewDetail,
  CrewSummary,
  GlobalLeaderboard,
  HistoryGame,
  PublicUser,
} from '../src/accountTypes.ts';
import { safeReturn } from '../src/auth.ts';
import type { ServerMessage } from '../src/protocol.ts';

const BASE = 'https://colonizers.test';
let n = 0;
const uniqueEmail = (who: string) => `${who}-${++n}-${Date.now()}@example.com`;

function cookieFrom(res: Response): string | null {
  const raw = res.headers.get('Set-Cookie') ?? '';
  const m = raw.match(/cz_session=([^;]*)/);
  return m?.[1] ? `cz_session=${m[1]}` : null;
}

async function api(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string | null; json?: boolean } = {},
): Promise<{ status: number; data: Record<string, unknown>; res: Response }> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined && opts.json !== false) headers['Content-Type'] = 'application/json';
  const res = await exports.default.fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers,
    body: opts.body === undefined ? null : JSON.stringify(opts.body),
    redirect: 'manual' as const,
  });
  const data = (await res
    .clone()
    .json()
    .catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data, res };
}

async function signUp(name: string, email = uniqueEmail(name), password = 'correct horse') {
  const r = await api('/api/auth/signup', { body: { email, password, name } });
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  return { cookie: cookieFrom(r.res)!, user: r.data.user as PublicUser, email, password };
}

const main = () => env.ACCOUNTS.getByName('main');

/** The token in the last email sent to someone, from the test outbox. */
async function emailLink(email: string, param: 'verify' | 'reset'): Promise<string> {
  const mail = await main().lastEmail(email);
  const token = mail?.body.match(new RegExp(`\\?${param}=([A-Za-z0-9_-]+)`))?.[1];
  if (!token) throw new Error(`No ${param} link for ${email}`);
  return token;
}

/** A WebSocket into a room, signed in when a cookie is given. */
async function joinRoom(
  code: string,
  name: string,
  token: string,
  cookie?: string | null,
  extra: Record<string, string> = {},
) {
  const res = await exports.default.fetch(`${BASE}/api/rooms/${code}/ws`, {
    headers: { Upgrade: 'websocket', ...(cookie ? { Cookie: cookie } : {}), ...extra },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const messages: ServerMessage[] = [];
  ws.addEventListener('message', (e) => {
    messages.push(JSON.parse(e.data as string) as ServerMessage);
  });
  ws.accept();
  ws.send(JSON.stringify({ type: 'hello', token, name }));
  const wait = async (pred: (m: ServerMessage) => boolean) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const found = messages.find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Timed out');
  };
  const welcome = (await wait((m) => m.type === 'welcome')) as Extract<
    ServerMessage,
    { type: 'welcome' }
  >;
  return { ws, messages, wait, you: welcome.you };
}

async function newRoom(): Promise<string> {
  const res = await exports.default.fetch(`${BASE}/api/rooms`, { method: 'POST' });
  return ((await res.json()) as { code: string }).code;
}

describe('Email accounts', () => {
  it('signs up, signs out and signs back in', async () => {
    const a = await signUp('Ann');
    expect(a.user.name).toBe('Ann');
    expect(a.user.emailVerified).toBe(false);
    expect(a.cookie).toMatch(/^cz_session=/);
    const setCookie = (
      await api('/api/auth/login', { body: { email: a.email, password: a.password } })
    ).res.headers.get('Set-Cookie')!;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');

    expect((await api('/api/me', { cookie: a.cookie })).data.user).toMatchObject({ id: a.user.id });
    expect((await api('/api/me')).data.user).toBeNull();

    await api('/api/auth/logout', { body: {}, cookie: a.cookie });
    expect((await api('/api/me', { cookie: a.cookie })).data.user).toBeNull();

    const wrong = await api('/api/auth/login', { body: { email: a.email, password: 'nope nope' } });
    expect(wrong.status).toBe(401);
    const right = await api('/api/auth/login', {
      body: { email: a.email.toUpperCase(), password: a.password },
    });
    expect(right.status).toBe(200);
    expect((await api('/api/me', { cookie: cookieFrom(right.res) })).data.user).toMatchObject({
      id: a.user.id,
    });
  });

  it('refuses bad sign-ups', async () => {
    const a = await signUp('Dup');
    expect(
      (await api('/api/auth/signup', { body: { email: a.email, password: 'another one' } })).status,
    ).toBe(409);
    expect(
      (await api('/api/auth/signup', { body: { email: 'not-an-email', password: 'long enough' } }))
        .status,
    ).toBe(400);
    const short = await api('/api/auth/signup', {
      body: { email: uniqueEmail('short'), password: 'short' },
    });
    expect(short.status).toBe(400);
    expect(short.data.error).toMatch(/8 characters/);
  });

  it('only takes JSON, so other sites cannot post forms', async () => {
    const r = await api('/api/auth/login', {
      body: { email: 'x@y.zz', password: 'x' },
      json: false,
    });
    expect(r.status).toBe(415);
  });

  it('slows down password guessing', async () => {
    const a = await signUp('Guess');
    for (let i = 0; i < 10; i++)
      expect(
        (await api('/api/auth/login', { body: { email: a.email, password: `wrong-${i}-pass` } }))
          .status,
      ).toBe(401);
    const blocked = await api('/api/auth/login', {
      body: { email: a.email, password: a.password },
    });
    expect(blocked.status).toBe(429);
  });

  it('confirms an email from the link it sends', async () => {
    const a = await signUp('Ver');
    const token = await emailLink(a.email, 'verify');
    expect((await api('/api/auth/verify', { body: { token } })).status).toBe(200);
    expect(
      ((await api('/api/me', { cookie: a.cookie })).data.user as PublicUser).emailVerified,
    ).toBe(true);
    // Each link works once.
    expect((await api('/api/auth/verify', { body: { token } })).status).toBe(400);
  });

  it('resets a forgotten password and signs out other devices', async () => {
    const a = await signUp('Reset');
    expect((await api('/api/auth/forgot', { body: { email: a.email } })).status).toBe(200);
    // Unknown addresses get the same answer.
    expect((await api('/api/auth/forgot', { body: { email: uniqueEmail('ghost') } })).status).toBe(
      200,
    );
    const token = await emailLink(a.email, 'reset');
    const r = await api('/api/auth/reset', { body: { token, password: 'brand new secret' } });
    expect(r.status).toBe(200);
    expect((await api('/api/me', { cookie: a.cookie })).data.user).toBeNull();
    expect((await api('/api/me', { cookie: cookieFrom(r.res) })).data.user).toMatchObject({
      id: a.user.id,
      emailVerified: true,
    });
    expect(
      (await api('/api/auth/login', { body: { email: a.email, password: a.password } })).status,
    ).toBe(401);
    expect(
      (await api('/api/auth/login', { body: { email: a.email, password: 'brand new secret' } }))
        .status,
    ).toBe(200);
  });

  it('updates the profile and password', async () => {
    const a = await signUp('Prof');
    const p = await api('/api/me', {
      method: 'PATCH',
      body: { name: '  Proffy  ', avatar: '🐙' },
      cookie: a.cookie,
    });
    expect(p.data.user).toMatchObject({ name: 'Proffy', avatar: '🐙' });
    expect(
      (await api('/api/me', { method: 'PATCH', body: { avatar: 'X' }, cookie: a.cookie })).status,
    ).toBe(400);
    expect((await api('/api/me', { method: 'PATCH', body: { name: 'x' } })).status).toBe(401);
    expect(
      (
        await api('/api/me/password', {
          body: { current: 'wrong pass', password: 'next secret' },
          cookie: a.cookie,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await api('/api/me/password', {
          body: { current: a.password, password: 'next secret' },
          cookie: a.cookie,
        })
      ).status,
    ).toBe(200);
    expect(
      (await api('/api/auth/login', { body: { email: a.email, password: 'next secret' } })).status,
    ).toBe(200);
  });
});

describe('Google sign-in', () => {
  it('says when Google is not set up', async () => {
    expect((await api('/api/auth/config')).data).toEqual({ google: false });
    expect((await api('/api/auth/google')).status).toBe(503);
    const cb = await api('/api/auth/google/callback?code=x&state=y');
    expect(cb.status).toBe(302);
    expect(cb.res.headers.get('Location')).toBe('/?signin=google-off');
  });

  it('links Google to a confirmed account, and takes over an unconfirmed one', async () => {
    const verified = await signUp('Gv');
    await main().verifyEmail(await emailLink(verified.email, 'verify'));
    const g1 = await main().googleLogin({
      sub: `sub-${verified.email}`,
      email: verified.email,
      emailVerified: true,
      name: 'Google Name',
    });
    expect(g1.user.id).toBe(verified.user.id);
    expect(g1.user.google).toBe(true);
    expect(g1.user.hasPassword).toBe(true);

    // Someone signed up with this address but never proved it: Google proves it,
    // and the unproven password stops working.
    const squatter = await signUp('Gu');
    const g2 = await main().googleLogin({
      sub: `sub-${squatter.email}`,
      email: squatter.email,
      emailVerified: true,
      name: 'Real Owner',
    });
    expect(g2.user.id).toBe(squatter.user.id);
    expect(g2.user.hasPassword).toBe(false);
    expect(g2.user.emailVerified).toBe(true);
    expect((await api('/api/me', { cookie: squatter.cookie })).data.user).toBeNull();
    expect(
      (
        await api('/api/auth/login', {
          body: { email: squatter.email, password: squatter.password },
        })
      ).status,
    ).toBe(401);

    // Same Google id next time, and a brand-new person gets a new account.
    const again = await main().googleLogin({
      sub: `sub-${squatter.email}`,
      email: null,
      emailVerified: false,
      name: null,
    });
    expect(again.user.id).toBe(squatter.user.id);
    const fresh = await main().googleLogin({
      sub: `sub-new-${n}`,
      email: uniqueEmail('fresh'),
      emailVerified: true,
      name: 'Fresh',
    });
    expect(fresh.user.name).toBe('Fresh');
    expect(fresh.user.emailVerified).toBe(true);
  });

  it('only sends people back to pages on this site', () => {
    expect(safeReturn('/r/abc')).toBe('/r/abc');
    expect(safeReturn('/me?x=1')).toBe('/me?x=1');
    expect(safeReturn('//evil.example')).toBe('/');
    expect(safeReturn('https://evil.example')).toBe('/');
    expect(safeReturn('/\\evil.example')).toBe('/');
    expect(safeReturn(null)).toBe('/');
  });
});

describe('Rooms and history', () => {
  it('records games for signed-in players and moves guest seats after sign-in', async () => {
    const ann = await signUp('HAnn');
    const code = await newRoom();
    const a = await joinRoom(code, 'Ann', 'ann-device-token-00001', ann.cookie);
    const b = await joinRoom(code, 'Ben', 'ben-device-token-00001');
    a.ws.send(JSON.stringify({ type: 'start' }));
    await a.wait((m) => m.type === 'welcome' && m.game !== null);

    const annHistory = (await api('/api/me/history', { cookie: ann.cookie })).data
      .games as HistoryGame[];
    expect(annHistory).toHaveLength(1);
    const game = annHistory[0]!;
    expect(game.room).toBe(code);
    expect(game.ended).toBeNull();
    expect(game.players.map((p) => p.name).sort()).toEqual(['Ann', 'Ben']);
    expect(game.players.find((p) => p.name === 'Ben')!.userId).toBeNull();

    // Ben was a guest; after signing up, this device's seat moves to his account.
    const ben = await signUp('HBen');
    const claim = await api('/api/me/claim', {
      body: {
        rooms: [
          { code, token: 'ben-device-token-00001' },
          { code: 'nope', token: 'x' },
        ],
      },
      cookie: ben.cookie,
    });
    expect(claim.data.claimed).toBe(1);
    // Someone else can't take the same seat afterwards.
    const other = await signUp('HOther');
    expect(
      (
        await api('/api/me/claim', {
          body: { rooms: [{ code, token: 'ben-device-token-00001' }] },
          cookie: other.cookie,
        })
      ).data.claimed,
    ).toBe(0);
    await new Promise((r) => setTimeout(r, 50));
    const benHistory = (await api('/api/me/history', { cookie: ben.cookie })).data
      .games as HistoryGame[];
    expect(benHistory.map((g) => g.id)).toEqual([game.id]);

    // Ann's second device, with another token, gets the same seat.
    const a2 = await joinRoom(code, 'Ann', 'ann-other-device-00002', ann.cookie);
    expect(a2.you).toBe(a.you);

    // A browser can't pretend to be signed in by sending the header itself.
    const fake = await joinRoom(code, 'Fake', 'fake-device-token-0003', null, {
      'X-Colonizers-User': ann.user.id,
    });
    expect(fake.you).not.toBe(a.you);

    // The finished game shows the winner and points.
    await main().finishGame(game.id, 0, [10, 7]);
    const done = (
      (await api('/api/me/history', { cookie: ben.cookie })).data.games as HistoryGame[]
    )[0]!;
    expect(done.ended).not.toBeNull();
    expect(done.players[0]).toMatchObject({ vp: 10, won: true });
    expect(done.players[1]).toMatchObject({ vp: 7, won: false });
    for (const c of [a, b, a2, fake]) c.ws.close();
  });

  it('needs a sign-in for history', async () => {
    expect((await api('/api/me/history')).status).toBe(401);
  });
});

describe('Crews', () => {
  it('creates a crew, invites friends and keeps a leaderboard', async () => {
    const ann = await signUp('CAnn');
    const ben = await signUp('CBen');
    const cat = await signUp('CCat');
    const created = await api('/api/crews', {
      body: { name: 'Tuesday Table' },
      cookie: ann.cookie,
    });
    const crew = created.data.crew as CrewSummary;
    expect(crew).toMatchObject({ name: 'Tuesday Table', members: 1, owner: true });

    expect((await api(`/api/crews/invite/${crew.invite}`)).data.crew).toMatchObject({
      name: 'Tuesday Table',
      members: 1,
    });
    expect((await api('/api/crews/join', { body: { invite: crew.invite } })).status).toBe(401);
    for (const who of [ben, cat])
      expect(
        (await api('/api/crews/join', { body: { invite: crew.invite }, cookie: who.cookie }))
          .status,
      ).toBe(200);

    // Two crew games and one game Ann played with strangers.
    const players = (ids: (string | null)[]) =>
      ids.map((userId, seat) => ({ seat, name: `P${seat}`, userId }));
    await main().recordGame({
      id: `cg1-${n}`,
      room: 'r1',
      modules: ['base'],
      players: players([ann.user.id, ben.user.id, null]),
    });
    await main().finishGame(`cg1-${n}`, 1, [6, 10, 4]);
    await main().recordGame({
      id: `cg2-${n}`,
      room: 'r2',
      modules: ['base', 'cities-knights'],
      players: players([ann.user.id, ben.user.id, cat.user.id]),
    });
    await main().finishGame(`cg2-${n}`, 0, [13, 9, 8]);
    await main().recordGame({
      id: `solo-${n}`,
      room: 'r3',
      modules: ['base'],
      players: players([ann.user.id, null]),
    });
    await main().finishGame(`solo-${n}`, 0, [10, 3]);

    const detail = (await api(`/api/crews/${crew.id}`, { cookie: cat.cookie })).data
      .crew as CrewDetail;
    expect(detail.members.map((m) => m.name)).toEqual(['CAnn', 'CBen', 'CCat']);
    expect(detail.games).toHaveLength(2);
    expect(detail.leaderboard.map((r) => [r.name, r.wins, r.games])).toEqual([
      ['CAnn', 1, 2],
      ['CBen', 1, 2],
      ['CCat', 0, 1],
    ]);

    // Outsiders can't see it; only the owner can change the link.
    const eve = await signUp('CEve');
    expect((await api(`/api/crews/${crew.id}`, { cookie: eve.cookie })).status).toBe(404);
    expect(
      (await api(`/api/crews/${crew.id}/invite`, { body: {}, cookie: ben.cookie })).status,
    ).toBe(403);
    const renewed = await api(`/api/crews/${crew.id}/invite`, { body: {}, cookie: ann.cookie });
    expect(renewed.data.invite).not.toBe(crew.invite);
    expect(
      (await api('/api/crews/join', { body: { invite: crew.invite }, cookie: eve.cookie })).status,
    ).toBe(404);

    // When the owner leaves, the longest member takes over.
    await api(`/api/crews/${crew.id}/leave`, { body: {}, cookie: ann.cookie });
    const after = (await api(`/api/crews/${crew.id}`, { cookie: ben.cookie })).data
      .crew as CrewDetail;
    expect(after.owner).toBe(ben.user.id);
    expect(
      ((await api('/api/crews', { cookie: ann.cookie })).data.crews as CrewSummary[]).length,
    ).toBe(0);
  });
});

describe('Global leaderboard', () => {
  it('ranks everyone by wins in games with two signed-in players', async () => {
    const lia = await signUp('GLia');
    const max = await signUp('GMax');
    const ned = await signUp('GNed');
    expect(lia.user.onLeaderboard).toBe(true);
    expect((await api('/api/leaderboard')).status).toBe(401);

    const players = (ids: (string | null)[]) =>
      ids.map((userId, seat) => ({ seat, name: `P${seat}`, userId }));
    const play = async (id: string, ids: (string | null)[], winner?: number, vp?: number[]) => {
      await main().recordGame({ id, room: id, modules: ['base'], players: players(ids) });
      if (winner !== undefined && vp) await main().finishGame(id, winner, vp);
    };
    await play(`gl1-${n}`, [lia.user.id, max.user.id, null], 1, [6, 10, 4]);
    await play(`gl2-${n}`, [lia.user.id, max.user.id, ned.user.id], 0, [13, 9, 8]);
    await play(`gl3-${n}`, [lia.user.id, max.user.id], 0, [10, 7]);
    // Neither of these counts: a win against bots only, and a game nobody finished.
    await play(`gl4-${n}`, [ned.user.id, null, null], 0, [10, 2, 3]);
    await play(`gl5-${n}`, [ned.user.id, max.user.id]);

    const board = async (cookie: string) =>
      (await api('/api/leaderboard', { cookie })).data.leaderboard as GlobalLeaderboard;
    const seen = await board(ned.cookie);
    const row = (id: string) => seen.rows.find((r) => r.id === id);
    expect(row(lia.user.id)).toMatchObject({ name: 'GLia', wins: 2, games: 3, averageVp: 9.7 });
    expect(row(max.user.id)).toMatchObject({ wins: 1, games: 3, averageVp: 8.7 });
    expect(row(ned.user.id)).toMatchObject({ wins: 0, games: 1, averageVp: 8 });
    expect(row(lia.user.id)!.rank).toBeLessThan(row(max.user.id)!.rank);
    expect(row(max.user.id)!.rank).toBeLessThan(row(ned.user.id)!.rank);
    expect(seen.you).toEqual(row(ned.user.id));
    expect(seen.players).toBeGreaterThanOrEqual(3);

    // Players can leave the board, and come back.
    expect(
      (await api('/api/me', { method: 'PATCH', body: { onLeaderboard: 'no' }, cookie: ned.cookie }))
        .status,
    ).toBe(400);
    const off = await api('/api/me', {
      method: 'PATCH',
      body: { onLeaderboard: false },
      cookie: ned.cookie,
    });
    expect((off.data.user as PublicUser).onLeaderboard).toBe(false);
    const hidden = await board(ned.cookie);
    expect(hidden.you).toBeNull();
    expect(hidden.rows.some((r) => r.id === ned.user.id)).toBe(false);
    expect((await board(lia.cookie)).you).toMatchObject({ id: lia.user.id, wins: 2 });
    await api('/api/me', { method: 'PATCH', body: { onLeaderboard: true }, cookie: ned.cookie });
    expect((await board(ned.cookie)).you).toMatchObject({ id: ned.user.id, games: 1 });
  });
});

describe('Site settings', () => {
  it('lets players choose until an admin sets a look for everyone', async () => {
    expect((await api('/api/site')).data.site).toEqual({ look: null, board: null });
    const body = { look: 'atlas', board: 'atlas' };
    expect((await api('/api/site', { method: 'PATCH', body })).status).toBe(401);
    const a = await signUp('Pat');
    expect((await api('/api/site', { method: 'PATCH', body, cookie: a.cookie })).status).toBe(403);
    const acc = env.ACCOUNTS.getByName('main');
    await acc.setSiteSettings(body);
    expect((await api('/api/site')).data.site).toEqual(body);
    await acc.setSiteSettings({ look: null, board: null });
    expect((await api('/api/site')).data.site).toEqual({ look: null, board: null });
  });
});
