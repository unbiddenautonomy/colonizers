import { describe, expect, it } from 'vitest';
import {
  cleanOptions,
  cleanSettings,
  DEFAULT_SETTINGS,
  moduleList,
  resolvedTurnMode,
} from '../src/protocol.ts';
import { buildConfig, library } from '../src/rules.ts';

const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

describe('game options', () => {
  it('cleans junk into the defaults', () => {
    const o = cleanOptions({
      turnMode: 'chaos',
      discardLimit: 99,
      gifting: 'yes',
      robberFreeRounds: 2,
    });
    expect(o).toMatchObject({
      turnMode: 'auto',
      discardLimit: 7,
      gifting: false,
      robberFreeRounds: 2,
    });
    expect(cleanSettings({ options: null }).options.turnMode).toBe('auto');
  });

  it('picks a turn style for the table size', () => {
    const auto = cleanOptions({});
    expect(resolvedTurnMode(auto, 4)).toBe('normal');
    expect(resolvedTurnMode(auto, 6)).toBe('specialBuild');
    expect(resolvedTurnMode(auto, 8)).toBe('paired');
    expect(resolvedTurnMode({ ...auto, turnMode: 'paired' }, 3)).toBe('normal');
  });

  it('orders modules so Cities & Knights dice win', () => {
    expect(moduleList(['seafarers', 'special-maps'], true)).toEqual([
      'base',
      'seafarers',
      'special-maps',
      'variants',
      'cities-knights',
    ]);
  });

  it('turns options into engine settings', () => {
    const settings = cleanSettings({
      ...DEFAULT_SETTINGS,
      options: {
        turnMode: 'auto',
        friendlyRobber: true,
        discardLimit: 9,
        firstSettlementPays: true,
      },
    });
    const config = buildConfig(settings, names(6), 'seed');
    expect(config.modules).toEqual(['base', 'variants']);
    expect(config.settings).toMatchObject({
      turnMode: 'specialBuild',
      friendlyRobber: true,
      discardLimit: 9,
      startingResourcesBothRounds: true,
    });
    const state = library.createGame(config).state;
    expect(state.players).toHaveLength(6);
  });

  it('builds a special map with the modules it needs', () => {
    const settings = cleanSettings({
      ...DEFAULT_SETTINGS,
      map: { kind: 'special', id: 'volcano' },
    });
    const config = buildConfig(settings, names(4), 'seed');
    expect(config.modules).toEqual(['base', 'seafarers', 'special-maps', 'variants']);
    const state = library.createGame(config).state;
    expect(Object.values(state.hexes).some((h) => h.type === 'volcano')).toBe(true);
  });

  it('falls back to a normal board when a special map does not fit the table', () => {
    const settings = cleanSettings({ ...DEFAULT_SETTINGS, map: { kind: 'special', id: 'mini' } });
    const config = buildConfig(settings, names(6), 'seed');
    expect(config.modules).toEqual(['base', 'variants']);
  });

  it('adds Greed, Wealth & Power on top of Cities & Knights, playing to 18', () => {
    const settings = cleanSettings({
      ...DEFAULT_SETTINGS,
      citiesKnights: true,
      greedWealthPower: true,
    });
    const config = buildConfig(settings, names(4), 'seed');
    expect(config.modules).toEqual(['base', 'variants', 'cities-knights', 'greed-wealth-power']);
    expect(config.settings?.vpTarget).toBe(18);
    const state = library.createGame(config).state;
    expect(
      state.settings.progressLimit ?? library.registry(state.modules).settings.progressLimit,
    ).toBe(5);
    // Without Cities & Knights it has nothing to go on.
    const alone = buildConfig(
      cleanSettings({ ...DEFAULT_SETTINGS, greedWealthPower: true }),
      names(4),
      'seed',
    );
    expect(alone.modules).not.toContain('greed-wealth-power');
  });

  it('builds Traders & Barbarians scenarios on the base game only', () => {
    for (const id of ['fishermen', 'rivers']) {
      const settings = cleanSettings({
        ...DEFAULT_SETTINGS,
        citiesKnights: true,
        map: { kind: 'special', id },
        options: { harbormaster: true },
      });
      const config = buildConfig(settings, names(4), 'seed');
      expect(config.modules).toEqual(['base', 'traders-barbarians', 'variants']);
      expect(config.settings?.tbScenario).toBe(id);
      expect(config.settings?.harbormaster).toBe(true);
      expect(config.settings?.vpTarget).toBe(10);
      const state = library.createGame(config).state;
      expect(state.modules).toContain('traders-barbarians');
    }
  });
});

describe('custom maps', () => {
  it('play a map from the editor, and refuse a broken one', async () => {
    const { blankDraft, draftToMapFile, randomNumbers } = await import('@colonizers/maps');
    const draft = randomNumbers(
      {
        ...blankDraft('Our island'),
        players: { min: 2, max: 4 },
      },
      's',
    );
    const map = draftToMapFile(draft);
    const settings = cleanSettings({ ...DEFAULT_SETTINGS, map: { kind: 'custom', map } });
    expect(settings.map.kind).toBe('custom');
    const config = buildConfig(settings, names(3), 'custom');
    expect(config.map.hexes).toHaveLength(37);
    const state = library.createGame(config).state;
    expect(state.phase.id).toBe('setup');
    // Too many players for the map: a random board instead.
    expect(buildConfig(settings, names(5), 'custom').map.hexes.length).not.toBe(37);
    // A map with a desert carrying a number is refused.
    const bad = {
      ...map,
      hexes: map.hexes.map((h) => (h.type === 'sea' ? { ...h, token: 5 } : h)),
    };
    expect(cleanSettings({ ...DEFAULT_SETTINGS, map: { kind: 'custom', map: bad } }).map.kind).toBe(
      'random',
    );
  });
});
