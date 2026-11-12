import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.ts';

/**
 * Accounts, sessions, crews and game history, in one SQLite-backed Durable
 * Object (named "main"). A friend-group game needs far less than one object
 * can handle, and Durable Objects get enough CPU time for password hashing,
 * which a plain Worker request does not.
 */

import type { CrewDetail, CrewSummary, HistoryGame, PublicUser, Result } from './accountTypes.ts';

export type { CrewDetail, CrewSummary, HistoryGame, PublicUser, Result };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string, status = 400): Result<T> => ({ ok: false, error, status });

const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100_000;
const MAX_FAILED_LOGINS = 10;
const LOGIN_WINDOW = 15 * 60 * 1000;
const AVATARS = ['🦊', '🐻', '🦉', '🐢', '🐙', '🦁', '🐺', '🦄', '🐝', '🐳', '🦜', '🐸'];

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, iter, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i]! ^ want[i]!;
  return diff === 0;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(CONTROL, '').trim().slice(0, 20);
  return name.length ? name : null;
}

export function passwordProblem(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'Use a password of at least 8 characters';
  if (p.length > 200) return 'That password is too long';
  return null;
}

interface UserRow extends Record<string, SqlStorageValue> {
  id: string;
  email: string | null;
  email_verified: number;
  password_hash: string | null;
  google_sub: string | null;
  name: string;
  avatar: string;
  created: number;
}

function publicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    email: u.email,
    emailVerified: u.email_verified === 1,
    hasPassword: !!u.password_hash,
    google: !!u.google_sub,
    created: u.created,
  };
}

export class Accounts extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        password_hash TEXT,
        google_sub TEXT UNIQUE,
        name TEXT NOT NULL,
        avatar TEXT NOT NULL,
        created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created INTEGER NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
      CREATE TABLE IF NOT EXISTS email_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS failed_logins (
        email TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        since INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crews (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        invite TEXT NOT NULL UNIQUE,
        owner TEXT NOT NULL,
        created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crew_members (
        crew_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined INTEGER NOT NULL,
        PRIMARY KEY (crew_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        room TEXT NOT NULL,
        modules TEXT NOT NULL,
        started INTEGER NOT NULL,
        ended INTEGER
      );
      CREATE TABLE IF NOT EXISTS game_players (
        game_id TEXT NOT NULL,
        seat INTEGER NOT NULL,
        user_id TEXT,
        name TEXT NOT NULL,
        vp INTEGER,
        won INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (game_id, seat)
      );
      CREATE INDEX IF NOT EXISTS game_players_user ON game_players (user_id);
    `);
  }

  // ---- Users and sessions ----

  private user(id: string): UserRow | null {
    return this.sql.exec<UserRow>('SELECT * FROM users WHERE id = ?', id).toArray()[0] ?? null;
  }

  private userByEmail(email: string): UserRow | null {
    return (
      this.sql.exec<UserRow>('SELECT * FROM users WHERE email = ?', email).toArray()[0] ?? null
    );
  }

  private async newSession(userId: string): Promise<string> {
    const token = randomToken();
    const now = Date.now();
    this.sql.exec(
      'INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)',
      await sha256(token),
      userId,
      now,
      now + SESSION_DAYS * DAY,
    );
    return token;
  }

  private createUser(fields: {
    email: string | null;
    verified: boolean;
    passwordHash: string | null;
    googleSub: string | null;
    name: string;
  }): UserRow {
    const id = crypto.randomUUID();
    const avatar = AVATARS[crypto.getRandomValues(new Uint8Array(1))[0]! % AVATARS.length]!;
    this.sql.exec(
      `INSERT INTO users (id, email, email_verified, password_hash, google_sub, name, avatar, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      fields.email,
      fields.verified ? 1 : 0,
      fields.passwordHash,
      fields.googleSub,
      fields.name,
      avatar,
      Date.now(),
    );
    return this.user(id) as UserRow;
  }

  /** The signed-in user for a session token, or null. Expired sessions are cleaned up. */
  async me(token: string | null): Promise<PublicUser | null> {
    const u = await this.sessionUser(token);
    return u ? publicUser(u) : null;
  }

  private async sessionUser(token: string | null): Promise<UserRow | null> {
    if (!token) return null;
    const hash = await sha256(token);
    const row = this.sql
      .exec<{ user_id: string; expires: number }>(
        'SELECT user_id, expires FROM sessions WHERE token_hash = ?',
        hash,
      )
      .toArray()[0];
    if (!row) return null;
    if (row.expires < Date.now()) {
      this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', hash);
      return null;
    }
    return this.user(row.user_id);
  }

  async signUp(
    emailRaw: unknown,
    password: unknown,
    nameRaw: unknown,
    origin: string,
  ): Promise<Result<{ user: PublicUser; token: string }>> {
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) return fail('Enter a valid email address');
    const problem = passwordProblem(password);
    if (problem) return fail(problem);
    const name = cleanName(nameRaw) ?? email.split('@')[0]!.slice(0, 20);
    if (this.userByEmail(email)) return fail('There is already an account with that email', 409);
    const u = this.createUser({
      email,
      verified: false,
      passwordHash: await hashPassword(password as string),
      googleSub: null,
      name,
    });
    await this.sendVerify(u, origin);
    return ok({ user: publicUser(u), token: await this.newSession(u.id) });
  }

  async logIn(
    emailRaw: unknown,
    password: unknown,
  ): Promise<Result<{ user: PublicUser; token: string }>> {
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
    if (!email || typeof password !== 'string') return fail('Enter your email and password');
    const now = Date.now();
    const failed = this.sql
      .exec<{ count: number; since: number }>(
        'SELECT count, since FROM failed_logins WHERE email = ?',
        email,
      )
      .toArray()[0];
    if (failed && now - failed.since < LOGIN_WINDOW && failed.count >= MAX_FAILED_LOGINS)
      return fail('Too many attempts. Try again in a few minutes, or reset your password.', 429);
    const u = this.userByEmail(email);
    const good = !!u?.password_hash && (await verifyPassword(password, u.password_hash));
    if (!u || !good) {
      if (!failed || now - failed.since >= LOGIN_WINDOW)
        this.sql.exec(
          'INSERT OR REPLACE INTO failed_logins (email, count, since) VALUES (?, 1, ?)',
          email,
          now,
        );
      else this.sql.exec('UPDATE failed_logins SET count = count + 1 WHERE email = ?', email);
      return fail('Wrong email or password', 401);
    }
    this.sql.exec('DELETE FROM failed_logins WHERE email = ?', email);
    return ok({ user: publicUser(u), token: await this.newSession(u.id) });
  }

  async logOut(token: string | null): Promise<void> {
    if (token) this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256(token));
  }

  /**
   * Google sign-in. Finds the account by Google id, or links a verified
   * account with the same email, or makes a new one.
   */
  async googleLogin(info: {
    sub: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
  }): Promise<{ user: PublicUser; token: string }> {
    let u =
      this.sql.exec<UserRow>('SELECT * FROM users WHERE google_sub = ?', info.sub).toArray()[0] ??
      null;
    const email = info.email?.toLowerCase() ?? null;
    if (!u && email && info.emailVerified) {
      const existing = this.userByEmail(email);
      // Only link to an address its owner has proven, so nobody can pre-claim someone's email.
      if (existing && existing.email_verified === 1) {
        this.sql.exec('UPDATE users SET google_sub = ? WHERE id = ?', info.sub, existing.id);
        u = this.user(existing.id);
      } else if (existing) {
        // An unproven password account with this address: Google proves it now, and the
        // unproven password is dropped so whoever set it can't get in.
        this.sql.exec(
          'UPDATE users SET google_sub = ?, email_verified = 1, password_hash = NULL WHERE id = ?',
          info.sub,
          existing.id,
        );
        this.sql.exec('DELETE FROM sessions WHERE user_id = ?', existing.id);
        u = this.user(existing.id);
      }
    }
    u ??= this.createUser({
      email: email && info.emailVerified && !this.userByEmail(email) ? email : null,
      verified: info.emailVerified,
      passwordHash: null,
      googleSub: info.sub,
      name: cleanName(info.name) ?? 'Player',
    });
    return { user: publicUser(u), token: await this.newSession(u.id) };
  }

  async updateProfile(
    token: string | null,
    fields: { name?: unknown; avatar?: unknown },
  ): Promise<Result<PublicUser>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    if (fields.name !== undefined) {
      const name = cleanName(fields.name);
      if (!name) return fail('Enter a name');
      this.sql.exec('UPDATE users SET name = ? WHERE id = ?', name, u.id);
    }
    if (fields.avatar !== undefined) {
      if (typeof fields.avatar !== 'string' || !AVATARS.includes(fields.avatar))
        return fail('Pick one of the avatars');
      this.sql.exec('UPDATE users SET avatar = ? WHERE id = ?', fields.avatar, u.id);
    }
    return ok(publicUser(this.user(u.id) as UserRow));
  }

  async setPassword(token: string | null, current: unknown, next: unknown): Promise<Result<null>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    if (u.password_hash) {
      if (typeof current !== 'string' || !(await verifyPassword(current, u.password_hash)))
        return fail('Your current password is wrong', 401);
    }
    if (!u.email) return fail('Add an email first');
    const problem = passwordProblem(next);
    if (problem) return fail(problem);
    this.sql.exec(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      await hashPassword(next as string),
      u.id,
    );
    return ok(null);
  }

  // ---- Email ----

  private async emailToken(userId: string, kind: 'verify' | 'reset', hours: number) {
    const token = randomToken();
    this.sql.exec('DELETE FROM email_tokens WHERE user_id = ? AND kind = ?', userId, kind);
    this.sql.exec(
      'INSERT INTO email_tokens (token_hash, user_id, kind, expires) VALUES (?, ?, ?, ?)',
      await sha256(token),
      userId,
      kind,
      Date.now() + hours * 60 * 60 * 1000,
    );
    return token;
  }

  private async useEmailToken(token: unknown, kind: string): Promise<string | null> {
    if (typeof token !== 'string' || token.length > 100) return null;
    const hash = await sha256(token);
    const row = this.sql
      .exec<{ user_id: string; expires: number }>(
        'SELECT user_id, expires FROM email_tokens WHERE token_hash = ? AND kind = ?',
        hash,
        kind,
      )
      .toArray()[0];
    this.sql.exec('DELETE FROM email_tokens WHERE token_hash = ?', hash);
    if (!row || row.expires < Date.now()) return null;
    return row.user_id;
  }

  private async sendVerify(u: UserRow, origin: string): Promise<void> {
    if (!u.email) return;
    const token = await this.emailToken(u.id, 'verify', 72);
    await this.sendEmail(
      u.email,
      'Confirm your Colonizers email',
      `Hi ${u.name},\n\nConfirm your email by opening this link:\n${origin}/?verify=${token}\n\nIf you did not sign up, you can ignore this email.`,
    );
  }

  async resendVerify(token: string | null, origin: string): Promise<Result<null>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    if (u.email_verified) return fail('Your email is already confirmed');
    await this.sendVerify(u, origin);
    return ok(null);
  }

  async verifyEmail(token: unknown): Promise<Result<null>> {
    const userId = await this.useEmailToken(token, 'verify');
    if (!userId) return fail('That link has expired. Send a new one from your profile.');
    this.sql.exec('UPDATE users SET email_verified = 1 WHERE id = ?', userId);
    return ok(null);
  }

  /** Always succeeds, so nobody can use it to find out who has an account. */
  async requestReset(emailRaw: unknown, origin: string): Promise<void> {
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
    const u = email ? this.userByEmail(email) : null;
    if (!u?.email) return;
    const token = await this.emailToken(u.id, 'reset', 2);
    await this.sendEmail(
      u.email,
      'Reset your Colonizers password',
      `Hi ${u.name},\n\nSet a new password by opening this link (it works for 2 hours):\n${origin}/?reset=${token}\n\nIf you did not ask for this, you can ignore this email.`,
    );
  }

  async resetPassword(
    token: unknown,
    password: unknown,
  ): Promise<Result<{ user: PublicUser; token: string }>> {
    const problem = passwordProblem(password);
    if (problem) return fail(problem);
    const userId = await this.useEmailToken(token, 'reset');
    if (!userId) return fail('That link has expired. Ask for a new one.');
    // The link proves the email; sign out everywhere else.
    this.sql.exec(
      'UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?',
      await hashPassword(password as string),
      userId,
    );
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', userId);
    this.sql.exec('DELETE FROM failed_logins WHERE email = ?', this.user(userId)?.email ?? '');
    return ok({
      user: publicUser(this.user(userId) as UserRow),
      token: await this.newSession(userId),
    });
  }

  private async sendEmail(to: string, subject: string, body: string): Promise<void> {
    const key = this.env.RESEND_API_KEY;
    if (!key) {
      // No email service set up yet (local runs and tests): keep it in the outbox.
      this.sql.exec(
        'INSERT INTO outbox (recipient, subject, body, created) VALUES (?, ?, ?, ?)',
        to,
        subject,
        body,
        Date.now(),
      );
      this.sql.exec(
        'DELETE FROM outbox WHERE id NOT IN (SELECT id FROM outbox ORDER BY id DESC LIMIT 50)',
      );
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.env.EMAIL_FROM || 'Colonizers <onboarding@resend.dev>',
        to,
        subject,
        text: body,
      }),
    });
    if (!res.ok) console.error('Email failed', res.status, await res.text());
  }

  /** Latest unsent email for an address. Only reachable from tests and local tools, not HTTP. */
  async lastEmail(to: string): Promise<{ subject: string; body: string } | null> {
    return (
      this.sql
        .exec<{ subject: string; body: string }>(
          'SELECT subject, body FROM outbox WHERE recipient = ? ORDER BY id DESC LIMIT 1',
          to.toLowerCase(),
        )
        .toArray()[0] ?? null
    );
  }

  // ---- Game history ----

  /** A room started a game. Players with accounts get it in their history. */
  async recordGame(game: {
    id: string;
    room: string;
    modules: string[];
    players: { seat: number; name: string; userId: string | null }[];
  }): Promise<void> {
    this.sql.exec(
      'INSERT OR REPLACE INTO games (id, room, modules, started, ended) VALUES (?, ?, ?, ?, NULL)',
      game.id,
      game.room,
      JSON.stringify(game.modules),
      Date.now(),
    );
    this.sql.exec('DELETE FROM game_players WHERE game_id = ?', game.id);
    for (const p of game.players)
      this.sql.exec(
        'INSERT INTO game_players (game_id, seat, user_id, name) VALUES (?, ?, ?, ?)',
        game.id,
        p.seat,
        p.userId,
        p.name,
      );
  }

  async finishGame(id: string, winner: number, vp: number[]): Promise<void> {
    this.sql.exec('UPDATE games SET ended = ? WHERE id = ?', Date.now(), id);
    vp.forEach((v, seat) =>
      this.sql.exec(
        'UPDATE game_players SET vp = ?, won = ? WHERE game_id = ? AND seat = ?',
        v,
        seat === winner ? 1 : 0,
        id,
        seat,
      ),
    );
  }

  /** A guest seat in a game now belongs to an account. */
  async attachPlayer(gameId: string, seat: number, userId: string): Promise<void> {
    this.sql.exec(
      'UPDATE game_players SET user_id = ? WHERE game_id = ? AND seat = ? AND user_id IS NULL',
      userId,
      gameId,
      seat,
    );
  }

  private games(ids: string[]): HistoryGame[] {
    if (!ids.length) return [];
    const out: HistoryGame[] = [];
    for (const id of ids) {
      const g = this.sql
        .exec<{ id: string; room: string; modules: string; started: number; ended: number | null }>(
          'SELECT * FROM games WHERE id = ?',
          id,
        )
        .toArray()[0];
      if (!g) continue;
      const players = this.sql
        .exec<{
          seat: number;
          name: string;
          vp: number | null;
          won: number;
          user_id: string | null;
        }>(
          'SELECT seat, name, vp, won, user_id FROM game_players WHERE game_id = ? ORDER BY seat',
          id,
        )
        .toArray()
        .map((p) => ({
          seat: p.seat,
          name: p.name,
          vp: p.vp,
          won: p.won === 1,
          userId: p.user_id,
        }));
      out.push({
        id: g.id,
        room: g.room,
        modules: JSON.parse(g.modules) as string[],
        started: g.started,
        ended: g.ended,
        players,
      });
    }
    return out;
  }

  async history(token: string | null): Promise<Result<HistoryGame[]>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    const rows = this.sql
      .exec<{ game_id: string; seat: number }>(
        `SELECT gp.game_id, gp.seat FROM game_players gp JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = ? ORDER BY g.started DESC LIMIT 100`,
        u.id,
      )
      .toArray();
    const seats = new Map(rows.map((r) => [r.game_id, r.seat]));
    return ok(
      this.games(rows.map((r) => r.game_id)).map((g) => ({ ...g, seat: seats.get(g.id) ?? null })),
    );
  }

  // ---- Crews ----

  async createCrew(token: string | null, nameRaw: unknown): Promise<Result<CrewSummary>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    const name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, 40) : '';
    if (!name) return fail('Give your crew a name');
    const owned = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM crews WHERE owner = ?', u.id)
      .one().n;
    if (owned >= 10) return fail('You can start up to 10 crews');
    const id = crypto.randomUUID().slice(0, 8);
    const invite = randomToken(9);
    const now = Date.now();
    this.sql.exec(
      'INSERT INTO crews (id, name, invite, owner, created) VALUES (?, ?, ?, ?, ?)',
      id,
      name,
      invite,
      u.id,
      now,
    );
    this.sql.exec(
      'INSERT INTO crew_members (crew_id, user_id, joined) VALUES (?, ?, ?)',
      id,
      u.id,
      now,
    );
    return ok({ id, name, invite, members: 1, owner: true });
  }

  async crews(token: string | null): Promise<Result<CrewSummary[]>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    const rows = this.sql
      .exec<{ id: string; name: string; invite: string; owner: string; members: number }>(
        `SELECT c.id, c.name, c.invite, c.owner,
           (SELECT COUNT(*) FROM crew_members m2 WHERE m2.crew_id = c.id) AS members
         FROM crews c JOIN crew_members m ON m.crew_id = c.id
         WHERE m.user_id = ? ORDER BY m.joined`,
        u.id,
      )
      .toArray();
    return ok(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        invite: r.invite,
        members: r.members,
        owner: r.owner === u.id,
      })),
    );
  }

  /** The crew name behind an invite, so the join page can say what you are joining. */
  async crewByInvite(
    invite: unknown,
  ): Promise<{ id: string; name: string; members: number } | null> {
    if (typeof invite !== 'string') return null;
    const c = this.sql
      .exec<{ id: string; name: string }>('SELECT id, name FROM crews WHERE invite = ?', invite)
      .toArray()[0];
    if (!c) return null;
    const members = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM crew_members WHERE crew_id = ?', c.id)
      .one().n;
    return { id: c.id, name: c.name, members };
  }

  async joinCrew(token: string | null, invite: unknown): Promise<Result<CrewSummary>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    const c = await this.crewByInvite(invite);
    if (!c) return fail('That invite link is not valid any more', 404);
    if (c.members >= 50) return fail('That crew is full');
    this.sql.exec(
      'INSERT OR IGNORE INTO crew_members (crew_id, user_id, joined) VALUES (?, ?, ?)',
      c.id,
      u.id,
      Date.now(),
    );
    const list = await this.crews(token);
    const mine = list.ok ? list.value.find((x) => x.id === c.id) : undefined;
    return mine ? ok(mine) : fail('Could not join');
  }

  async leaveCrew(token: string | null, crewId: unknown): Promise<Result<null>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    if (typeof crewId !== 'string') return fail('Unknown crew', 404);
    this.sql.exec('DELETE FROM crew_members WHERE crew_id = ? AND user_id = ?', crewId, u.id);
    const left = this.sql
      .exec<{ user_id: string }>(
        'SELECT user_id FROM crew_members WHERE crew_id = ? ORDER BY joined LIMIT 1',
        crewId,
      )
      .toArray()[0];
    if (!left) this.sql.exec('DELETE FROM crews WHERE id = ?', crewId);
    else
      this.sql.exec(
        'UPDATE crews SET owner = ? WHERE id = ? AND owner = ?',
        left.user_id,
        crewId,
        u.id,
      );
    return ok(null);
  }

  /** A new invite link; the old one stops working. Owner only. */
  async renewInvite(token: string | null, crewId: unknown): Promise<Result<string>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    const c = this.sql
      .exec<{ owner: string }>('SELECT owner FROM crews WHERE id = ?', crewId as string)
      .toArray()[0];
    if (!c) return fail('Unknown crew', 404);
    if (c.owner !== u.id) return fail('Only the crew owner can do that', 403);
    const invite = randomToken(9);
    this.sql.exec('UPDATE crews SET invite = ? WHERE id = ?', invite, crewId as string);
    return ok(invite);
  }

  async crew(token: string | null, crewId: unknown): Promise<Result<CrewDetail>> {
    const u = await this.sessionUser(token);
    if (!u) return fail('Sign in first', 401);
    if (typeof crewId !== 'string') return fail('Unknown crew', 404);
    const c = this.sql
      .exec<{ id: string; name: string; invite: string; owner: string }>(
        'SELECT id, name, invite, owner FROM crews WHERE id = ?',
        crewId,
      )
      .toArray()[0];
    const isMember =
      this.sql
        .exec('SELECT 1 FROM crew_members WHERE crew_id = ? AND user_id = ?', crewId, u.id)
        .toArray().length > 0;
    if (!c || !isMember) return fail('Unknown crew', 404);
    const members = this.sql
      .exec<{ id: string; name: string; avatar: string; joined: number }>(
        `SELECT u.id, u.name, u.avatar, m.joined FROM crew_members m JOIN users u ON u.id = m.user_id
         WHERE m.crew_id = ? ORDER BY m.joined`,
        crewId,
      )
      .toArray()
      .map((m) => ({ ...m }));
    // Crew games: at least two crew members played in them.
    const gameIds = this.sql
      .exec<{ game_id: string }>(
        `SELECT gp.game_id FROM game_players gp
         JOIN crew_members m ON m.user_id = gp.user_id AND m.crew_id = ?
         JOIN games g ON g.id = gp.game_id
         GROUP BY gp.game_id HAVING COUNT(DISTINCT gp.user_id) >= 2
         ORDER BY MAX(g.started) DESC LIMIT 200`,
        crewId,
      )
      .toArray()
      .map((r) => r.game_id);
    const games = this.games(gameIds);
    const ids = new Set(members.map((m) => m.id));
    const board = new Map(
      members.map((m) => [m.id, { id: m.id, name: m.name, games: 0, wins: 0 }]),
    );
    for (const g of games) {
      if (g.ended === null) continue;
      for (const p of g.players) {
        if (!p.userId || !ids.has(p.userId)) continue;
        const row = board.get(p.userId)!;
        row.games += 1;
        if (p.won) row.wins += 1;
      }
    }
    const leaderboard = [...board.values()].sort(
      (a, b) => b.wins - a.wins || a.games - b.games || a.name.localeCompare(b.name),
    );
    return ok({
      id: c.id,
      name: c.name,
      invite: c.invite,
      owner: c.owner,
      members,
      leaderboard,
      games: games.slice(0, 30),
    });
  }
}

export { AVATARS };
