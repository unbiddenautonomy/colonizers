/**
 * The lobby settings for one online room per expansion, sea scenario, special board and
 * screen-changing house rule. Usage: tsx gen-online-configs.ts online-configs.json
 */
import { writeFileSync } from 'node:fs';
const REPO = process.env.REPO ?? '../../..';
const maps = await import(`${REPO}/packages/maps/src/index.ts`);
const modes = await import(`${REPO}/packages/modes/src/index.ts`);
const rules = await import(`${REPO}/apps/server/src/rules.ts`);
const protocol = await import(`${REPO}/apps/server/src/protocol.ts`);
type Any = Record<string, any>;
const MODE_IDS: string[] = [...modes.MODES];
const REQUIRES: Record<string, string> = {
  greedWealthPower: 'citiesKnights',
  civilisations: 'greedWealthPower',
  church: 'citiesKnights',
  witches: 'citiesKnights',
  strategist: 'citiesKnights',
};
const closure = (set: string[]) => {
  const out = new Set(set);
  for (let i = 0; i < 5; i++) for (const m of [...out]) if (REQUIRES[m]) out.add(REQUIRES[m]!);
  return MODE_IDS.filter((m) => out.has(m));
};
const resolved = (map: Any, wanted: string[]) => {
  const on: Set<string> = modes.resolve(rules.boardInfo(map), wanted);
  return MODE_IDS.filter((m) => on.has(m));
};
const out: Any[] = [];
const fit = (p: Any, want: number) => Math.min(p.max, Math.max(p.min, want));
const add = (name: string, map: Any, wanted: string[], players: number, options: Any = {}) => {
  const patch: Any = {
    map,
    options: { ...protocol.DEFAULT_OPTIONS, ...options },
    maxPlayers: players,
    ...Object.fromEntries(MODE_IDS.map((m) => [m, wanted.includes(m)])),
  };
  const settings = protocol.cleanSettings({ ...protocol.DEFAULT_SETTINGS, ...patch });
  const names = ['Host', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'].slice(0, players);
  const config = rules.buildConfig(settings, names, `x-${name}`);
  out.push({ name, players, patch, expectModules: config.modules, expectTarget: config.settings.vpTarget });
};
const classic = { kind: 'random', mode: 'classic' };
add('base', classic, [], 3);
add('base-6p', classic, [], 6);
for (const m of MODE_IDS) {
  const wanted = closure([m]);
  const candidates: Any[] = [classic, { kind: 'scenario', id: 'new-shores' }, ...maps.SPECIAL_MAPS.map((p: Any) => ({ kind: 'special', id: p.id }))];
  const map = candidates.find((c) => resolved(c, wanted).includes(m));
  if (!map) { console.log('no board for', m); continue; }
  add(`mode-${m}`, map, wanted, 3);
}
for (const p of maps.SEA_SCENARIOS as Any[]) add(`sea-${p.id}`, { kind: 'scenario', id: p.id }, [], fit(p.players, 3));
for (const p of maps.SPECIAL_MAPS as Any[]) add(`special-${p.id}`, { kind: 'special', id: p.id }, p.needsCitiesKnights ? ['citiesKnights'] : [], fit(p.players, 3));
add('opt-paired-6p', classic, [], 6, { turnMode: 'paired' });
add('opt-specialbuild-5p', classic, [], 5, { turnMode: 'specialBuild' });
add('opt-events-gifting', classic, [], 3, { eventCards: true, gifting: true, openTrading: true, harbormaster: true });
add('opt-duel', classic, [], 2, { twoPlayer: true });
// A few mixes friends are likely to pick.
add('mix-sea-ck', { kind: 'scenario', id: 'new-shores' }, ['citiesKnights'], 3);
add('mix-ck-wonders', classic, ['citiesKnights', 'worldWonders'], 3);
add('mix-sea-landwater', { kind: 'scenario', id: 'new-shores' }, ['landWater'], 3);
add('mix-princes-investors', classic, ['princes', 'investors'], 3);
writeFileSync(process.argv[2]!, JSON.stringify(out));
console.log(out.map((o) => `${o.name}: ${o.expectModules.join(',')} | ${o.players}p | target ${o.expectTarget}`).join('\n'));
