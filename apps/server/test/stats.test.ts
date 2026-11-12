import { describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import type { Action } from '@colonizers/engine';
import { chooseAction, newMemory } from '@colonizers/bots';
import type { MyStats, Replay } from '../src/accountTypes.ts';
import { cleanSettings, DEFAULT_SETTINGS } from '../src/protocol.ts';
import { buildConfig, library } from '../src/rules.ts';

const BASE = 'https://colonizers.test';
let n = 0;

async function api(path: string, cookie: string | null, body?: unknown) {
  const res = await exports.default.fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? null : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data, res };
}

async function signUp(name: string) {
  const r = await api('/api/auth/signup', null, {
    email: `${name}-${++n}-${Date.now()}@example.com`,
    password: 'correct horse',
    name,
  });
  const m = (r.res.headers.get('Set-Cookie') ?? '').match(/cz_session=([^;]*)/);
  return { cookie: `cz_session=${m![1]}`, id: (r.data.user as { id: string }).id };
}

/** Two bots play a whole game; returns its config and moves. */
function botGame(seed: string) {
  const config = buildConfig(cleanSettings(DEFAULT_SETTINGS), ['A', 'B'], seed);
  let s = library.createGame(config).state;
  const actions: Action[] = [];
  const memory = [newMemory(), newMemory()];
  let clock = 0;
  for (let i = 0; i < 5000 && s.winner === null; i++) {
    clock += 1000;
    let acted = false;
    for (const seat of library.waitingOn(s)) {
      const a = chooseAction(
        library,
        s,
        seat,
        { level: 'medium', style: 'balanced' },
        memory[seat]!,
        {
          now: clock,
          rand: () => 0.42,
        },
      );
      if (!a) continue;
      s = library.apply(s, a).state;
      actions.push(a);
      acted = true;
      break;
    }
    if (!acted) clock += 20_000;
  }
  return { config, actions, state: s };
}

const main = () => env.ACCOUNTS.getByName('main');

describe('Stats and achievements', () => {
  it('works out stats at game end, unlocks achievements and shares the replay', async () => {
    const ann = await signUp('SAnn');
    const { config, actions, state } = botGame(`stats-${Date.now()}`);
    expect(state.winner).not.toBeNull();
    const id = `stats-${++n}`;
    await main().recordGame({
      id,
      room: 'stats',
      modules: config.modules,
      map: 'random:classic',
      players: [
        { seat: 0, name: 'SAnn', userId: ann.id },
        { seat: 1, name: 'Bot', userId: null, bot: 'hard' },
      ],
    });
    const vp = [0, 0];
    const unlocked = await main().finishGame(id, state.winner!, vp, { config, actions });
    const ids = unlocked.find((u) => u.seat === 0)?.ids ?? [];
    if (state.winner === 0) expect(ids).toEqual(expect.arrayContaining(['first-win', 'beat-hard']));
    else expect(ids).not.toContain('first-win');

    const stats = (await api('/api/me/stats', ann.cookie)).data.stats as MyStats;
    expect(stats.career.games).toBe(1);
    expect(stats.career.wins).toBe(state.winner === 0 ? 1 : 0);
    expect(stats.career.diceLuck?.expected).toBeGreaterThan(0);
    expect(stats.career.byMap).toEqual([
      { map: 'random:classic', games: 1, wins: state.winner === 0 ? 1 : 0 },
    ]);
    expect(stats.achievements.map((a) => a.id).sort()).toEqual([...ids].sort());

    // The history knows there is a replay, and the replay plays back to the same end.
    const history = (await api('/api/me/history', ann.cookie)).data.games as { replay: boolean }[];
    expect(history[0]?.replay).toBe(true);
    const replay = (await api(`/api/games/${id}/replay`, ann.cookie)).data.replay as Replay;
    expect(replay.actions).toHaveLength(actions.length);
    expect(library.replay(replay.config, replay.actions).winner).toBe(state.winner);

    // Strangers can't see it.
    const eve = await signUp('SEve');
    expect((await api(`/api/games/${id}/replay`, eve.cookie)).status).toBe(404);
    expect((await api(`/api/games/${id}/replay`, null)).status).toBe(401);
  });

  it('back-fills achievements from games played before they existed', async () => {
    const ben = await signUp('SBen');
    for (let i = 0; i < 10; i++) {
      const id = `old-${n}-${i}`;
      await main().recordGame({
        id,
        room: 'old',
        modules: ['base'],
        players: [
          { seat: 0, name: 'SBen', userId: ben.id },
          { seat: 1, name: 'X', userId: null },
        ],
      });
      await main().finishGame(id, 1, [5, 10]);
    }
    const stats = (await api('/api/me/stats', ben.cookie)).data.stats as MyStats;
    expect(stats.career.games).toBe(10);
    expect(stats.achievements.map((a) => a.id)).toEqual(['regular']);
    expect((await api('/api/me/stats', null)).status).toBe(401);
  });
});
