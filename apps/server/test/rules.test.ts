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

  it('adds Church, Faith & Reformation on top of Cities & Knights, playing to 15', () => {
    const settings = cleanSettings({ ...DEFAULT_SETTINGS, citiesKnights: true, church: true });
    const config = buildConfig(settings, names(4), 'seed');
    expect(config.modules).toEqual(['base', 'variants', 'cities-knights', 'church']);
    expect(config.settings?.vpTarget).toBe(15);
    expect(library.createGame(config).state.decks.religion).toHaveLength(17);
    // Greed, Wealth & Power has its own Religion, so Church stays out.
    const both = buildConfig(
      cleanSettings({ ...settings, greedWealthPower: true }),
      names(4),
      'seed',
    );
    expect(both.modules).toContain('greed-wealth-power');
    expect(both.modules).not.toContain('church');
  });

  it('adds Witches, Wizards & Dragons alone (15) or with Church (17)', () => {
    const settings = cleanSettings({ ...DEFAULT_SETTINGS, citiesKnights: true, witches: true });
    const alone = buildConfig(settings, names(4), 'seed');
    expect(alone.modules).toEqual(['base', 'variants', 'cities-knights', 'witches']);
    expect(alone.settings?.vpTarget).toBe(15);
    expect(library.createGame(alone).state.decks.magic).toHaveLength(18);
    const both = buildConfig(cleanSettings({ ...settings, church: true }), names(4), 'seed');
    expect(both.modules).toEqual(['base', 'variants', 'cities-knights', 'witches', 'church']);
    expect(both.settings?.vpTarget).toBe(17);
    const gwp = buildConfig(
      cleanSettings({ ...settings, greedWealthPower: true }),
      names(4),
      'seed',
    );
    expect(gwp.modules).not.toContain('witches');
  });

  it('adds Princes & Explorers (14 points, 17 with Cities & Knights)', () => {
    const settings = cleanSettings({ ...DEFAULT_SETTINGS, princes: true });
    const four = buildConfig(settings, names(4), 'seed');
    expect(four.modules).toEqual(['base', 'variants', 'princes']);
    expect(four.settings?.vpTarget).toBe(14);
    const six = buildConfig(settings, names(6), 'seed');
    expect(six.settings?.turnMode).toBe('normal');
    const state = library.createGame(four).state;
    expect(Object.values(state.pieces).filter((p) => p.type === 'prince')).toHaveLength(4);
    // With Cities & Knights it plays to 17.
    const ck = buildConfig(cleanSettings({ ...settings, citiesKnights: true }), names(4), 'seed');
    expect(ck.modules).toEqual(['base', 'variants', 'cities-knights', 'princes']);
    expect(ck.settings?.vpTarget).toBe(17);
    // Not with the other fan expansions or Seafarers yet.
    const gwp = buildConfig(
      cleanSettings({ ...settings, citiesKnights: true, greedWealthPower: true }),
      names(4),
      'seed',
    );
    expect(gwp.modules).not.toContain('princes');
    // With Seafarers, four more than the scenario.
    const sea = buildConfig(
      cleanSettings({ ...settings, map: { kind: 'scenario', id: 'new-shores' } }),
      names(4),
      'seed',
    );
    expect(sea.modules).toEqual(['base', 'seafarers', 'variants', 'princes']);
    const plain = buildConfig(
      cleanSettings({ ...settings, princes: false, map: { kind: 'scenario', id: 'new-shores' } }),
      names(4),
      'seed',
    );
    expect(sea.settings?.vpTarget).toBe(Number(plain.settings?.vpTarget) + 4);
  });

  it('adds Soldiers & Armies on the base game (13 points)', () => {
    const settings = cleanSettings({ ...DEFAULT_SETTINGS, soldiers: true });
    const four = buildConfig(settings, names(4), 'seed');
    expect(four.modules).toEqual(['base', 'variants', 'soldiers']);
    expect(four.settings?.vpTarget).toBe(13);
    expect(buildConfig(settings, names(6), 'seed').settings?.turnMode).toBe('normal');
    const state = library.createGame(four).state;
    expect(state.decks.dev).not.toContain('victoryPoint');
    // With Seafarers, three more than the scenario.
    const sea = buildConfig(
      cleanSettings({ ...settings, map: { kind: 'scenario', id: 'new-shores' } }),
      names(4),
      'seed',
    );
    expect(sea.modules).toEqual(['base', 'seafarers', 'variants', 'soldiers']);
    // With Cities & Knights, to 16.
    const ck = buildConfig(cleanSettings({ ...settings, citiesKnights: true }), names(4), 'seed');
    expect(ck.modules).toEqual(['base', 'variants', 'cities-knights', 'soldiers']);
    expect(ck.settings?.vpTarget).toBe(16);
    // With Princes & Explorers, to its 14 (17 with Cities & Knights).
    const princes = buildConfig(cleanSettings({ ...settings, princes: true }), names(4), 'seed');
    expect(princes.modules).toEqual(['base', 'variants', 'princes', 'soldiers']);
    expect(princes.settings?.vpTarget).toBe(14);
    const both = buildConfig(
      cleanSettings({ ...settings, princes: true, citiesKnights: true }),
      names(4),
      'seed',
    );
    expect(both.settings?.vpTarget).toBe(17);
    // On the Explorers & Pirates scenarios, but not the other special maps.
    const ep = buildConfig(
      cleanSettings({ ...settings, map: { kind: 'special', id: 'pirate-lairs' } }),
      names(3),
      'seed',
    );
    expect(ep.modules).toContain('soldiers');
    expect(ep.modules).toContain('explorers-pirates');
    const tb = buildConfig(
      cleanSettings({ ...settings, map: { kind: 'special', id: 'fishermen' } }),
      names(4),
      'seed',
    );
    expect(tb.modules).not.toContain('soldiers');
    // Not with the other fan expansions yet.
    for (const more of [{ worldWonders: true }])
      expect(
        buildConfig(cleanSettings({ ...settings, ...more }), names(4), 'seed').modules,
      ).not.toContain('soldiers');
  });

  it('adds Investors & Speculators on the usual maps, Seafarers, the special maps and Cities & Knights', () => {
    const settings = cleanSettings({ ...DEFAULT_SETTINGS, investors: true });
    const four = buildConfig(settings, names(4), 'seed');
    expect(four.modules).toEqual(['base', 'variants', 'investors']);
    expect(four.settings?.vpTarget).toBe(10);
    const state = library.createGame(four).state;
    expect(state.data.investors).toMatchObject({ rates: { ore: 4, wool: 4 } });
    // With Cities & Knights and on the Seafarers scenarios.
    const ck = buildConfig(cleanSettings({ ...settings, citiesKnights: true }), names(4), 'seed');
    expect(ck.modules).toEqual(['base', 'variants', 'cities-knights', 'investors']);
    const sea = buildConfig(
      cleanSettings({ ...settings, map: { kind: 'scenario', id: 'new-shores' } }),
      names(4),
      'seed',
    );
    expect(sea.modules).toEqual(['base', 'seafarers', 'variants', 'investors']);
    // With Princes & Explorers, Soldiers & Armies and the Explorers & Pirates scenarios.
    const fan = buildConfig(
      cleanSettings({ ...settings, princes: true, soldiers: true }),
      names(4),
      'seed',
    );
    expect(fan.modules).toEqual(['base', 'variants', 'princes', 'soldiers', 'investors']);
    const ep = buildConfig(
      cleanSettings({ ...settings, map: { kind: 'special', id: 'pirate-lairs' } }),
      names(3),
      'seed',
    );
    expect(ep.modules).toContain('investors');
    // And the Traders & Barbarians scenarios, listed after them.
    const tb = buildConfig(
      cleanSettings({ ...settings, map: { kind: 'special', id: 'rivers' } }),
      names(4),
      'seed',
    );
    expect(tb.modules.indexOf('investors')).toBeGreaterThan(
      tb.modules.indexOf('traders-barbarians'),
    );
    // With Witches and Church on Cities & Knights.
    const magic = buildConfig(
      cleanSettings({ ...settings, citiesKnights: true, church: true, witches: true }),
      names(4),
      'seed',
    );
    expect(magic.modules).toEqual(
      expect.arrayContaining(['cities-knights', 'investors', 'witches', 'church']),
    );
    // With Greed, Wealth & Power and World Wonders too.
    for (const more of [{ worldWonders: true }, { citiesKnights: true, greedWealthPower: true }])
      expect(
        buildConfig(cleanSettings({ ...settings, ...more }), names(4), 'seed').modules,
      ).toContain('investors');
    // Not on the Treasures, Dragons & Adventurers maps yet.
    expect(
      buildConfig(
        cleanSettings({ ...settings, map: { kind: 'special', id: 'great-canal' } }),
        names(4),
        'seed',
      ).modules,
    ).not.toContain('investors');
  });

  it('adds Kingdoms & Warriors on the base game, 2 points more', () => {
    const settings = cleanSettings({ ...DEFAULT_SETTINGS, kingdoms: true });
    const four = buildConfig(settings, names(4), 'seed');
    expect(four.modules).toEqual(['base', 'variants', 'kingdoms']);
    expect(four.settings?.vpTarget).toBe(12);
    const state = library.createGame(four).state;
    expect(state.modules).toContain('kingdoms');
    const sea = buildConfig(
      cleanSettings({ ...settings, map: { kind: 'scenario', id: 'new-shores' } }),
      names(4),
      'seed',
    );
    expect(sea.modules).toContain('kingdoms');
    // Not yet with Cities & Knights or the other fan expansions.
    for (const more of [{ citiesKnights: true }, { princes: true }, { investors: true }])
      expect(
        buildConfig(cleanSettings({ ...settings, ...more }), names(4), 'seed').modules,
      ).not.toContain('kingdoms');
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
