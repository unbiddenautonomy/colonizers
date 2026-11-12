import type { Env } from './env.ts';
import type { Accounts } from './accounts.ts';
import type { PublicUser, Result } from './accountTypes.ts';
import { ROOM_CODE } from './protocol.ts';

/**
 * HTTP routes for accounts: sign-up, sign-in (email or Google), profile,
 * history and crews. The session lives in an HttpOnly cookie; the database
 * keeps only a hash of it.
 */

export const SESSION_COOKIE = 'cz_session';
const OAUTH_COOKIE = 'cz_oauth';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
/** Set by the Worker on room sockets. Anything a browser sends with this name is dropped. */
export const USER_HEADER = 'X-Colonizers-User';

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export function accounts(env: Env): DurableObjectStub<Accounts> {
  return env.ACCOUNTS.getByName('main');
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init?.headers },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

function fromResult<T>(r: Result<T>, wrap: (v: T) => unknown = (v) => v): Response {
  return r.ok ? json(wrap(r.value)) : error(r.error, r.status);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function cookie(name: string, value: string, maxAge: number, path = '/'): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function sessionToken(request: Request): string | null {
  const t = readCookie(request, SESSION_COOKIE);
  return t && t.length <= 100 ? t : null;
}

/** The signed-in user for a request, or null. */
export async function currentUser(request: Request, env: Env): Promise<PublicUser | null> {
  const token = sessionToken(request);
  return token ? accounts(env).me(token) : null;
}

function signedIn(value: { user: PublicUser; token: string }, status = 200): Response {
  return json(
    { user: value.user },
    { status, headers: { 'Set-Cookie': cookie(SESSION_COOKIE, value.token, SESSION_MAX_AGE) } },
  );
}

/** Only paths on this site, so a sign-in link can't send someone elsewhere. */
export function safeReturn(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (!/^\/[A-Za-z0-9/_\-?=&.%]*$/.test(raw) || raw.length > 200) return '/';
  return raw;
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await request.json();
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const bin = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) =>
    c === '+' ? '-' : c === '/' ? '_' : '',
  );
}

// ---- Google sign-in (OAuth code flow) ----

async function googleStart(url: URL, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    return error('Google sign-in is not set up on this server', 503);
  const state = randomState();
  const back = safeReturn(url.searchParams.get('return'));
  const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  target.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  target.searchParams.set('redirect_uri', `${url.origin}/api/auth/google/callback`);
  target.searchParams.set('response_type', 'code');
  target.searchParams.set('scope', 'openid email profile');
  target.searchParams.set('state', state);
  target.searchParams.set('prompt', 'select_account');
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Set-Cookie': cookie(OAUTH_COOKIE, `${state}|${back}`, 600, '/api/auth'),
      'Cache-Control': 'no-store',
    },
  });
}

async function googleCallback(request: Request, url: URL, env: Env): Promise<Response> {
  const saved = readCookie(request, OAUTH_COOKIE) ?? '';
  const [state, back] = [saved.split('|')[0], safeReturn(saved.split('|')[1] ?? '/')];
  const fail = (why: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `/?signin=${encodeURIComponent(why)}`,
        'Set-Cookie': cookie(OAUTH_COOKIE, '', 0, '/api/auth'),
      },
    });
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail('google-off');
  const code = url.searchParams.get('code');
  if (!state || url.searchParams.get('state') !== state || !code) return fail('google-failed');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) return fail('google-failed');
  const tokens = (await res.json()) as { id_token?: string };
  // The ID token came straight from Google over TLS, so its claims can be read
  // without checking the signature; the audience and issuer still must match.
  const claims = tokens.id_token ? b64urlJson(tokens.id_token.split('.')[1] ?? '') : null;
  if (
    !claims ||
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') ||
    typeof claims.sub !== 'string' ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 < Date.now()
  )
    return fail('google-failed');
  const r = await accounts(env).googleLogin({
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: typeof claims.name === 'string' ? claims.name : null,
  });
  // The page finishes sign-in (moving guest seats over) when it sees ?signedin.
  const landing = `${back}${back.includes('?') ? '&' : '?'}signedin=google`;
  const headers = new Headers({ Location: landing, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, r.token, SESSION_MAX_AGE));
  headers.append('Set-Cookie', cookie(OAUTH_COOKIE, '', 0, '/api/auth'));
  return new Response(null, { status: 302, headers });
}

// ---- Routes ----

/** Handles /api/auth/*, /api/me* and /api/crews*. Returns null for any other path. */
export async function accountRoutes(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!/^\/api\/(auth|me|crews)(\/|$)/.test(path)) return null;
  const method = request.method;
  const acc = accounts(env);
  const token = sessionToken(request);

  if (method === 'GET' && path === '/api/auth/google') return googleStart(url, env);
  if (method === 'GET' && path === '/api/auth/google/callback')
    return googleCallback(request, url, env);
  if (method === 'GET' && path === '/api/auth/config')
    return json({ google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) });

  if (method === 'GET') {
    if (path === '/api/me') return json({ user: token ? await acc.me(token) : null });
    if (path === '/api/me/history')
      return fromResult(await acc.history(token), (games) => ({ games }));
    if (path === '/api/crews') return fromResult(await acc.crews(token), (crews) => ({ crews }));
    const invite = path.match(/^\/api\/crews\/invite\/([A-Za-z0-9_-]{1,40})$/);
    if (invite) {
      const c = await acc.crewByInvite(invite[1]);
      return c ? json({ crew: c }) : error('That invite link is not valid any more', 404);
    }
    const crew = path.match(/^\/api\/crews\/([a-z0-9-]{1,40})$/);
    if (crew) return fromResult(await acc.crew(token, crew[1]), (c) => ({ crew: c }));
    return error('Not found', 404);
  }

  if (method !== 'POST' && method !== 'PATCH') return error('Method not allowed', 405);
  // Browsers can't send JSON to another site without asking first, so this
  // stops other sites from posting forms with someone's cookie.
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json'))
    return error('Send JSON', 415);
  const b = (await body(request)) ?? {};

  switch (`${method} ${path}`) {
    case 'POST /api/auth/signup': {
      const r = await acc.signUp(b.email, b.password, b.name, url.origin);
      return r.ok ? signedIn(r.value, 201) : error(r.error, r.status);
    }
    case 'POST /api/auth/login': {
      const r = await acc.logIn(b.email, b.password);
      return r.ok ? signedIn(r.value) : error(r.error, r.status);
    }
    case 'POST /api/auth/logout':
      await acc.logOut(token);
      return json({ ok: true }, { headers: { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) } });
    case 'POST /api/auth/verify':
      return fromResult(await acc.verifyEmail(b.token), () => ({ ok: true }));
    case 'POST /api/auth/resend-verify':
      return fromResult(await acc.resendVerify(token, url.origin), () => ({ ok: true }));
    case 'POST /api/auth/forgot':
      await acc.requestReset(b.email, url.origin);
      return json({ ok: true });
    case 'POST /api/auth/reset': {
      const r = await acc.resetPassword(b.token, b.password);
      return r.ok ? signedIn(r.value) : error(r.error, r.status);
    }
    case 'PATCH /api/me':
      return fromResult(
        await acc.updateProfile(token, { name: b.name, avatar: b.avatar }),
        (user) => ({ user }),
      );
    case 'POST /api/me/password':
      return fromResult(await acc.setPassword(token, b.current, b.password), () => ({ ok: true }));
    case 'POST /api/me/claim': {
      const user = token ? await acc.me(token) : null;
      if (!user) return error('Sign in first', 401);
      const rooms = Array.isArray(b.rooms) ? b.rooms.slice(0, 50) : [];
      let claimed = 0;
      for (const r of rooms as { code?: unknown; token?: unknown }[]) {
        if (typeof r?.code !== 'string' || !ROOM_CODE.test(r.code)) continue;
        if (typeof r.token !== 'string' || !TOKEN.test(r.token)) continue;
        claimed += await env.ROOMS.getByName(r.code).claim(r.token, user.id);
      }
      return json({ claimed });
    }
    case 'POST /api/crews':
      return fromResult(await acc.createCrew(token, b.name), (crew) => ({ crew }));
    case 'POST /api/crews/join':
      return fromResult(await acc.joinCrew(token, b.invite), (crew) => ({ crew }));
  }
  const leave = path.match(/^\/api\/crews\/([a-z0-9-]{1,40})\/(leave|invite)$/);
  if (method === 'POST' && leave) {
    if (leave[2] === 'leave')
      return fromResult(await acc.leaveCrew(token, leave[1]), () => ({ ok: true }));
    return fromResult(await acc.renewInvite(token, leave[1]), (invite) => ({ invite }));
  }
  return error('Not found', 404);
}
