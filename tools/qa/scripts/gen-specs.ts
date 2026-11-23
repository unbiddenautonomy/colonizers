/**
 * Builds the spec lists for the sweeps. Usage: tsx gen-specs.ts <sweep> <out.json>
 */
import { writeFileSync } from 'node:fs';
const REPO = process.env.REPO ?? '../../..';
const maps = await import(`${REPO}/packages/maps/src/index.ts`);
const modes = await import(`${REPO}/packages/modes/src/index.ts`);
const rules = await import(`${REPO}/apps/server/src/rules.ts`);

type Any = Record<string, any>;
interface Board {
  key: string;
  map: Any;
  min: number;
  max: number;
}

const boards: Board[] = [
  { key: 'random:classic', map: { kind: 'random', mode: 'classic' }, min: 2, max: 8 },
  { key: 'random:balanced', map: { kind: 'random', mode: 'balanced' }, min: 2, max: 8 },
  { key: 'random:wild', map: { kind: 'random', mode: 'wild' }, min: 2, max: 8 },
  ...maps.PRESETS.map((p: Any) => ({
    key: `preset:${p.id}`,
    map: { kind: 'preset', id: p.id },
    min: p.players.min,
    max: p.players.max,
  })),
  ...maps.SEA_SCENARIOS.map((p: Any) => ({
    key: `scenario:${p.id}`,
    map: { kind: 'scenario', id: p.id },
    min: p.players.min,
    max: p.players.max,
  })),
  ...maps.SPECIAL_MAPS.map((p: Any) => ({
    key: `special:${p.id}`,
    map: { kind: 'special', id: p.id },
    min: p.players.min,
    max: p.players.max,
  })),
];

const MODE_IDS: string[] = [...modes.MODES];
const REQUIRES: Record<string, string> = {
  greedWealthPower: 'citiesKnights',
  civilisations: 'greedWealthPower',
  church: 'citiesKnights',
  witches: 'citiesKnights',
  strategist: 'citiesKnights',
};

function closure(set: string[]): string[] {
  const out = new Set(set);
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of [...out]) {
      const need = REQUIRES[m];
      if (need && !out.has(need)) {
        out.add(need);
        changed = true;
      }
    }
  }
  return MODE_IDS.filter((m) => out.has(m));
}

/** The modes actually on for a board and a wish list, by the shared rule. */
function resolved(map: Any, wanted: string[]): string[] {
  const on: Set<string> = modes.resolve(rules.boardInfo(map), wanted);
  return MODE_IDS.filter((m) => on.has(m));
}

function settingsFor(map: Any, wanted: string[], extra: Any = {}): Any {
  const s: Any = { map, ...extra };
  for (const m of wanted) s[m] = true;
  return s;
}

function clampPlayers(b: Board, n: number): number {
  return Math.min(b.max, Math.max(b.min, n));
}

const sweep = process.argv[2];
const out = process.argv[3];
if (!sweep || !out) throw new Error('usage: gen-specs.ts <sweep> <out.json>');
const specs: Any[] = [];

if (sweep === 'boards') {
  // Every board at every player count it allows, no expansions.
  for (const b of boards)
    for (let n = b.min; n <= b.max; n++)
      for (const seed of ['a', 'b', 'c'])
        specs.push({ name: `${b.key}|${n}p`, settings: settingsFor(b.map, []), players: n, seed: `boards-${b.key}-${n}-${seed}` });
} else if (sweep === 'modes') {
  // Every single expansion on every board that takes it (with what it requires).
  for (const b of boards)
    for (const m of MODE_IDS) {
      const wanted = closure([m]);
      const on = resolved(b.map, wanted);
      if (!on.includes(m)) continue;
      // Skip when the board forces nothing new (already covered by "boards") is impossible here: m is on.
      const counts = [...new Set([clampPlayers(b, 4), clampPlayers(b, 3), clampPlayers(b, 6)])];
      for (const n of counts)
        for (const seed of n === clampPlayers(b, 4) ? ['a', 'b'] : ['a'])
          specs.push({
            name: `${b.key}|${on.join('+')}|${n}p`,
            settings: settingsFor(b.map, wanted),
            players: n,
            seed: `modes-${b.key}-${m}-${n}-${seed}`,
          });
    }
} else if (sweep === 'combos') {
  // Every mix of two or more expansions the shared rule accepts whole, on a usual board and a Seafarers one.
  const seen = new Set<string>();
  const targets = boards.filter((b) =>
    ['random:classic', 'scenario:new-shores', 'scenario:fog-islands', 'special:land-ho', 'special:fishermen', 'special:great-canal', 'special:enchanted-land', 'special:greater-catan'].includes(b.key),
  );
  const total = 1 << MODE_IDS.length;
  for (const b of targets)
    for (let mask = 1; mask < total; mask++) {
      const wanted = MODE_IDS.filter((_, i) => mask & (1 << i));
      const on = resolved(b.map, wanted);
      if (on.length < 2) continue;
      // Only mixes the screen can really make: everything asked for is on (plus what the board forces).
      if (!wanted.every((m) => on.includes(m))) continue;
      const key = `${b.key}|${on.join('+')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      specs.push({ name: `${key}|${clampPlayers(b, 4)}p`, settings: settingsFor(b.map, wanted), players: clampPlayers(b, 4), seed: `combos-${key}` });
    }
} else if (sweep === 'options') {
  const base = boards.find((b) => b.key === 'random:classic')!;
  const sea = boards.find((b) => b.key === 'scenario:new-shores')!;
  const opt = (name: string, options: Any, players: number, wanted: string[] = [], b: Board = base, extra: Any = {}) => {
    for (const seed of ['a', 'b', 'c'])
      specs.push({
        name: `opt:${name}|${b.key}|${wanted.join('+') || 'base'}|${players}p`,
        settings: settingsFor(b.map, wanted, { options, ...extra }),
        players,
        seed: `options-${name}-${b.key}-${wanted.join('+')}-${players}-${seed}`,
      });
  };
  for (const wanted of [[], ['citiesKnights']]) {
    for (const b of [base, sea]) {
      opt('friendlyRobber', { friendlyRobber: true }, 4, wanted, b);
      opt('robberHome', { robberHome: true }, 4, wanted, b);
      opt('openTrading', { openTrading: true }, 4, wanted, b);
      opt('balancedDice', { balancedDice: true }, 4, wanted, b);
      opt('robberFree3', { robberFreeRounds: 3 }, 4, wanted, b);
      opt('gifting', { gifting: true }, 4, wanted, b);
      opt('discard10', { discardLimit: 10 }, 4, wanted, b);
      opt('firstPays', { firstSettlementPays: true }, 4, wanted, b);
      opt('harbormaster', { harbormaster: true }, 4, wanted, b);
      opt('eventCards', { eventCards: true }, 4, wanted, b);
      opt('twoPlayer', { twoPlayer: true }, 2, wanted, b);
      opt('twoPlayerOff', {}, 2, wanted, b);
      opt('everything', { friendlyRobber: true, robberHome: true, openTrading: true, balancedDice: true, robberFreeRounds: 2, gifting: true, discardLimit: 9, firstSettlementPays: true, harbormaster: true }, 4, wanted, b);
      for (const tm of ['normal', 'specialBuild', 'paired'])
        for (const n of [4, 5, 6, 7, 8]) {
          if (n > b.max) continue;
          opt(`turn-${tm}`, { turnMode: tm }, n, wanted, b);
        }
      // Lowest and highest targets the picker allows.
      opt('vpLow', {}, 4, wanted, b, { vpTarget: 5 });
      opt('vpHigh', {}, 4, wanted, b, { vpTarget: 15 });
    }
  }
  opt('gwpRiver', { gwpRiver: true }, 4, ['citiesKnights', 'greedWealthPower']);
  opt('gwpRiver6', { gwpRiver: true }, 6, ['citiesKnights', 'greedWealthPower']);
  opt('wonderOptional', { wonderOptional: true }, 4, ['worldWonders']);
  opt('wonderOptionalCk', { wonderOptional: true }, 4, ['citiesKnights', 'worldWonders']);
  const dd = boards.find((b) => b.key === 'special:desert-dragons')!;
  for (const n of [3, 4, 5, 6]) {
    opt('dragonRelief', { dragonRelief: true }, n, [], dd);
    opt('dragonNoRelief', {}, n, [], dd);
  }
} else if (sweep === 'known') {
  // The four issues other threads already know about, with more seeds.
  const b = (key: string) => boards.find((x) => x.key === key)!;
  for (let i = 0; i < 12; i++) {
    for (const n of [3, 4, 6]) {
      specs.push({ name: `known:desert-dragons|${n}p`, settings: settingsFor(b('special:desert-dragons').map, []), players: n, seed: `known-dd-${n}-${i}` });
      specs.push({ name: `known:desert-dragons-relief|${n}p`, settings: settingsFor(b('special:desert-dragons').map, [], { options: { dragonRelief: true } }), players: n, seed: `known-ddr-${n}-${i}` });
    }
    specs.push({ name: 'known:great-canal+strategist|4p', settings: settingsFor(b('special:great-canal').map, ['citiesKnights', 'strategist']), players: 4, seed: `known-gc-s-${i}`, maxRounds: 400 });
    specs.push({ name: 'known:great-canal|4p', settings: settingsFor(b('special:great-canal').map, ['citiesKnights']), players: 4, seed: `known-gc-${i}`, maxRounds: 400 });
    specs.push({ name: 'known:great-canal+strategist@16|4p', settings: settingsFor(b('special:great-canal').map, ['citiesKnights', 'strategist'], { vpTarget: 8 }), players: 4, seed: `known-gc-s16-${i}`, maxRounds: 400 });
    for (const n of [3, 4]) {
      specs.push({ name: `known:princes+investors|${n}p`, settings: settingsFor(b('random:classic').map, ['princes', 'investors']), players: n, seed: `known-pi-${n}-${i}` });
      specs.push({ name: `known:princes|${n}p`, settings: settingsFor(b('random:classic').map, ['princes']), players: n, seed: `known-p-${n}-${i}` });
    }
    for (const n of [3, 4, 6])
      specs.push({ name: `known:landwater-new-shores|${n}p`, settings: settingsFor(b('scenario:new-shores').map, ['landWater']), players: n, seed: `known-lw-${n}-${i}` });
  }
} else if (sweep === 'afk') {
  // One seat is away and only the turn timer's safe moves play for it. The game must still end.
  for (const b of boards) {
    const n = clampPlayers(b, 4);
    specs.push({ name: `afk:${b.key}|base|${n}p`, settings: settingsFor(b.map, []), players: n, seed: `afk-${b.key}`, afk: [1], maxRounds: 200 });
    for (const m of MODE_IDS) {
      const wanted = closure([m]);
      const on = resolved(b.map, wanted);
      if (!on.includes(m)) continue;
      if (!['random:classic', 'scenario:new-shores', 'special:great-canal', 'special:enchanted-land', 'special:land-ho', 'special:fishermen', 'special:full-voyage'].includes(b.key)) continue;
      specs.push({ name: `afk:${b.key}|${on.join('+')}|${n}p`, settings: settingsFor(b.map, wanted), players: n, seed: `afk-${b.key}-${m}`, afk: [1], maxRounds: 200 });
    }
  }
  // Paired turns and the special building phase with someone away.
  for (const tm of ['specialBuild', 'paired'])
    for (const n of [5, 6, 8])
      specs.push({ name: `afk:turn-${tm}|${n}p`, settings: settingsFor({ kind: 'random', mode: 'classic' }, [], { options: { turnMode: tm } }), players: n, seed: `afk-${tm}-${n}`, afk: [1, 3], maxRounds: 200 });
  specs.push({ name: 'afk:duel|2p', settings: settingsFor({ kind: 'random', mode: 'classic' }, [], { options: { twoPlayer: true } }), players: 2, seed: 'afk-duel', afk: [1], maxRounds: 200 });
  specs.push({ name: 'afk:eventCards|4p', settings: settingsFor({ kind: 'random', mode: 'classic' }, [], { options: { eventCards: true } }), players: 4, seed: 'afk-events', afk: [1], maxRounds: 200 });
} else if (sweep === 'arena') {
  // Bot strength, style and seat-order fairness on the plain base game.
  const base = { kind: 'random', mode: 'classic' };
  const lv = ['easy', 'medium', 'hard'];
  for (let i = 0; i < 90; i++) {
    // Mixed levels, rotating seats.
    const order = [lv[i % 3]!, lv[(i + 1) % 3]!, lv[(i + 2) % 3]!, lv[(i + (i % 2 ? 1 : 2)) % 3]!];
    specs.push({ name: 'arena:levels', settings: { map: base }, players: 4, seed: `arena-lv-${i}`, bots: order.map((level) => ({ level, style: 'balanced' })), budgetMs: 800, light: true });
  }
  const st = ['balanced', 'builder', 'city', 'army', 'trader'];
  for (let i = 0; i < 100; i++) {
    const order = [0, 1, 2, 3].map((k) => st[(i + k * (1 + (i % 4))) % 5]!);
    specs.push({ name: 'arena:styles', settings: { map: base }, players: 4, seed: `arena-st-${i}`, bots: order.map((style) => ({ level: 'medium', style })), light: true });
  }
  for (let i = 0; i < 200; i++)
    specs.push({ name: 'arena:seats', settings: { map: base }, players: 4, seed: `arena-seat-${i}`, bots: [0, 1, 2, 3].map(() => ({ level: 'medium', style: 'balanced' })), light: true });
  for (let i = 0; i < 60; i++)
    specs.push({ name: 'arena:seats-balanced-map', settings: { map: { kind: 'random', mode: 'balanced' } }, players: 4, seed: `arena-seatb-${i}`, bots: [0, 1, 2, 3].map(() => ({ level: 'medium', style: 'balanced' })), light: true });
  for (let i = 0; i < 40; i++)
    specs.push({ name: 'arena:hard-only', settings: { map: base }, players: 4, seed: `arena-hard-${i}`, bots: [0, 1, 2, 3].map(() => ({ level: 'hard', style: 'balanced' })), budgetMs: 2500, light: true });
} else throw new Error(`unknown sweep ${sweep}`);

writeFileSync(out, JSON.stringify(specs));
console.log(`${sweep}: ${specs.length} specs -> ${out}`);
