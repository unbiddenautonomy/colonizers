import { describe, expect, it } from 'vitest';
import {
  MODES,
  modeStatus,
  resolve,
  warnings,
  weightLevel,
  weightOf,
  type BoardInfo,
  type ModeId,
} from '../src/index.ts';

const BOARDS: Record<string, BoardInfo> = {
  usual: { kind: 'usual' },
  seafarers: { kind: 'seafarers' },
  fog: { kind: 'seafarers', fog: true },
  goldRush: { kind: 'special' },
  traders: { kind: 'special', group: 'traders', noCk: true },
  treasures: { kind: 'special', group: 'treasures', needsCk: true },
  explorers: { kind: 'special', group: 'explorers' },
};

function* subsets(): Generator<ModeId[]> {
  for (let mask = 0; mask < 1 << MODES.length; mask++)
    yield MODES.filter((_, i) => mask & (1 << i));
}

const same = (a: Set<ModeId>, b: ModeId[]) => a.size === b.length && b.every((m) => a.has(m));

describe('mode compatibility', () => {
  it('blocks a mode exactly when the server would drop it or a picked one', () => {
    for (const [name, board] of Object.entries(BOARDS)) {
      for (const s of subsets()) {
        const set = resolve(board, s);
        if (!same(set, s)) continue;
        const status = modeStatus(board, s);
        for (const m of MODES) {
          if (set.has(m)) {
            expect(status[m].state).toBe('picked');
            continue;
          }
          const fits = same(resolve(board, [...s, m]), [...s, m]);
          expect(status[m].state === 'blocked', `${name}: [${s.join(',')}] + ${m}`).toBe(!fits);
          if (!fits) expect(status[m].reason).toBeTruthy();
        }
      }
    }
  });

  it('never needs the fallback reason: every block names its cause', () => {
    for (const board of Object.values(BOARDS))
      for (const s of subsets()) {
        if (!same(resolve(board, s), s)) continue;
        for (const st of Object.values(modeStatus(board, s)))
          expect(st.reason).not.toBe('Not with this mix yet.');
      }
  });

  it('explains the real rule clashes', () => {
    const b = BOARDS.seafarers as BoardInfo;
    const s = modeStatus(b, ['citiesKnights', 'church']);
    expect(s.greedWealthPower).toMatchObject({
      state: 'blocked',
      reason: expect.stringMatching(/Religion/),
    });
    expect(s.greedWealthPower.notYet).toBeUndefined();
    expect(s.princes).toMatchObject({ state: 'blocked', notYet: true });
    expect(s.witches).toMatchObject({ state: 'pair', reason: 'Made to go with Church.' });
    expect(s.strategist.state).toBe('pair');
    expect(s.civilisations.reason).toBe('Needs Greed, Wealth & Power.');
    expect(modeStatus(b, []).church.reason).toBe('Needs Cities & Knights.');
  });

  it('highlights Cities & Knights on Seafarers', () => {
    expect(modeStatus(BOARDS.seafarers as BoardInfo, []).citiesKnights.state).toBe('pair');
    expect(modeStatus(BOARDS.usual as BoardInfo, []).citiesKnights.state).toBe('ok');
  });

  it('weighs a mix and warns as it grows', () => {
    const b = BOARDS.seafarers as BoardInfo;
    expect(weightOf(b, ['citiesKnights'])).toBe(4);
    expect(weightLevel(weightOf(b, ['citiesKnights', 'church']))).toBe('heavy');
    expect(weightLevel(weightOf(b, ['citiesKnights', 'church', 'witches']))).toBe('chaos');
    expect(modeStatus(b, ['citiesKnights', 'church']).witches.weightWith).toBe(8);
    expect(warnings(b, ['citiesKnights', 'soldiers'])).toContain(
      'Soldiers & Armies takes the place of the Cities & Knights knights.',
    );
    expect(warnings(BOARDS.usual as BoardInfo, ['princes'], 20)).toContain(
      'Playing to 20 points makes for a long game.',
    );
  });
});
