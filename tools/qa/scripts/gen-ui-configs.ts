/**
 * Builds ready-to-resume local saves (one human seat, bots in the others) for every expansion and
 * every special board, with the server's own set-up code. Usage: tsx gen-ui-configs.ts out.json
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
const STYLES = ['balanced', 'builder', 'city', 'army', 'trader'];
const out: Any[] = [];
const add = (name: string, map: Any, wanted: string[], players: number, options: Any = {}) => {
  const settings: Any = protocol.cleanSettings({
    ...protocol.DEFAULT_SETTINGS,
    map,
    options: { ...protocol.DEFAULT_OPTIONS, ...options },
    maxPlayers: players,
    ...Object.fromEntries(wanted.map((m) => [m, true])),
  });
  const names = ['Alex', 'Blair', 'Casey', 'Devon', 'Eli', 'Fran', 'Gus', 'Hana'].slice(0, players);
  const config = { ...rules.buildConfig(settings, names, `ui-${name}`), fixedSeats: true };
  const bots: Any = {};
  for (let i = 1; i < players; i++) bots[i] = { level: 'medium', style: STYLES[i % STYLES.length] };
  const mapKey = map.kind === 'random' ? `random:${map.mode}` : `${map.kind}:${map.id}`;
  out.push({ name, save: { config, actions: [], bots, mapKey } });
};
const classic = { kind: 'random', mode: 'classic' };
add('base', classic, [], 4);
add('base-6p', classic, [], 6);
add('base-2p', classic, [], 2);
for (const m of MODE_IDS) {
  const wanted = closure([m]);
  const candidates: Any[] = [classic, { kind: 'scenario', id: 'new-shores' }, ...maps.SPECIAL_MAPS.map((p: Any) => ({ kind: 'special', id: p.id }))];
  const map = candidates.find((c) => resolved(c, wanted).includes(m));
  if (!map) {
    console.log('no board for', m);
    continue;
  }
  add(`mode-${m}`, map, wanted, 4);
}
for (const p of maps.SEA_SCENARIOS as Any[]) add(`sea-${p.id}`, { kind: 'scenario', id: p.id }, [], Math.min(p.players.max, Math.max(p.players.min, 4)));
for (const p of maps.SPECIAL_MAPS as Any[]) add(`special-${p.id}`, { kind: 'special', id: p.id }, [], Math.min(p.players.max, Math.max(p.players.min, 4)));
// House rules that change the screen.
add('opt-paired-6p', classic, [], 6, { turnMode: 'paired' });
add('opt-specialbuild-5p', classic, [], 5, { turnMode: 'specialBuild' });
add('opt-events-gifting', classic, [], 4, { eventCards: true, gifting: true, openTrading: true, harbormaster: true });
add('opt-duel', classic, [], 2, { twoPlayer: true });
writeFileSync(process.argv[2]!, JSON.stringify(out));
console.log(out.map((o) => `${o.name}: ${o.save.config.modules.join(',')} | ${o.save.mapKey} | ${o.save.config.players.length}p`).join('\n'));
