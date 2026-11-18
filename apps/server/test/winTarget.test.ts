import { describe, expect, it } from 'vitest';
import { Ctx } from '@colonizers/engine';
import { SEA_SCENARIOS, SPECIAL_MAPS } from '@colonizers/maps';
import { resolve, type ModeId } from '@colonizers/modes';
import { cleanSettings, DEFAULT_SETTINGS, type MapChoice } from '../src/protocol.ts';
import { boardInfo, buildConfig, library, wantedModes } from '../src/rules.ts';
import { chosenTarget, storedTarget, winTarget } from '../src/winTarget.ts';

const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

/** The target a game really plays to, once its modules have had their say. */
function inPlay(map: MapChoice, modes: ModeId[], n: number, stored: number) {
  const settings = cleanSettings({
    ...DEFAULT_SETTINGS,
    map,
    vpTarget: stored,
    ...Object.fromEntries(modes.map((m) => [m, true])),
  });
  const state = library.createGame(buildConfig(settings, names(n), 'target')).state;
  const target = winTarget(map, n, resolve(boardInfo(map), wantedModes(settings)));
  return { played: new Ctx(state, library.registry(state.modules)).vpTarget(), target };
}

const MIXES: ModeId[][] = [
  [],
  ['citiesKnights'],
  ['citiesKnights', 'greedWealthPower'],
  ['citiesKnights', 'greedWealthPower', 'civilisations'],
  ['citiesKnights', 'church', 'witches'],
  ['citiesKnights', 'strategist'],
  ['princes'],
  ['soldiers'],
  ['princes', 'soldiers'],
  ['kingdoms'],
  ['landWater'],
  ['citiesKnights', 'landWater'],
  ['investors'],
];

describe('points to win', () => {
  it('shows the target every mix really plays to, on the usual maps', () => {
    const map: MapChoice = { kind: 'random', mode: 'classic' };
    for (const mix of MIXES) {
      const { played, target } = inPlay(map, mix, 4, 10);
      expect(played, mix.join('+')).toBe(target.standard);
      expect(target.recommended).toBeLessThanOrEqual(target.standard);
    }
  });

  it('shows the target every scenario and special map plays to', () => {
    const maps: MapChoice[] = [
      ...SEA_SCENARIOS.map((x) => ({ kind: 'scenario' as const, id: x.id })),
      ...SPECIAL_MAPS.map((x) => ({ kind: 'special' as const, id: x.id })),
    ];
    for (const map of maps) {
      const special = SPECIAL_MAPS.find((x) => map.kind === 'special' && x.id === map.id);
      const n = special ? Math.max(special.players.min, Math.min(4, special.players.max)) : 4;
      for (const mix of [[], ['citiesKnights']] as ModeId[][]) {
        const { played, target } = inPlay(map, mix, n, 10);
        expect(played, `${map.kind}:${'id' in map ? map.id : ''} ${mix.join('+')}`).toBe(
          target.standard,
        );
      }
    }
  });

  it('lets the host move any target, scenarios included', () => {
    const canal: MapChoice = { kind: 'special', id: 'great-canal' };
    const plain = inPlay(canal, ['citiesKnights'], 4, 10);
    expect(plain.played).toBe(18);
    // It runs long, so we suggest a little less, but the official 18 stays the default.
    expect(plain.target.standard).toBe(18);
    expect(plain.target.recommended).toBe(16);
    expect(plain.target.advice).toMatch(/runs long/);
    expect(winTarget({ kind: 'random' }, 4, ['citiesKnights']).advice).toBeNull();
    const shorter = inPlay(canal, ['citiesKnights'], 4, storedTarget(plain.target, 15));
    expect(shorter.played).toBe(15);
    const sea = inPlay({ kind: 'scenario', id: 'new-shores' }, [], 4, 12);
    expect(sea.played).toBe(sea.target.standard + 2);
  });

  it('keeps every choice within reach and above the floor', () => {
    const t = winTarget({ kind: 'random' }, 4, []);
    expect(t.standard).toBe(10);
    expect(t.choices[0]).toBe(5);
    expect(t.choices.at(-1)).toBe(15);
    expect(chosenTarget(t, 99)).toBe(15);
    const civs = winTarget({ kind: 'random' }, 4, [
      'citiesKnights',
      'greedWealthPower',
      'civilisations',
    ]);
    expect(civs.standard).toBe(20);
    expect(civs.choices).toContain(15);
    expect(civs.choices).toContain(25);
    for (const v of civs.choices) expect(chosenTarget(civs, storedTarget(civs, v))).toBe(v);
  });
});
