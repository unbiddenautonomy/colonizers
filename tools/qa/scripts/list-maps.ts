import * as maps from '../../../packages/maps/src/index.ts';
const m: any = maps;
console.log(Object.keys(m).filter((k) => /SPECIAL|SEA_|PRESETS|special|Scenario/i.test(k)).join(', '));
const sp = m.SPECIAL_MAPS ?? [];
console.log('special', JSON.stringify(sp.map((x: any) => [x.id, x.players, x.group ?? null, x.needsCitiesKnights ? 'needsCK' : '', x.noCitiesKnights ? 'noCK' : ''])));
console.log('sea', JSON.stringify((m.SEA_SCENARIOS ?? []).map((x: any) => [x.id, x.players, x.fog ?? false])));
console.log('presets', JSON.stringify((m.PRESETS ?? []).map((x: any) => [x.id, x.players])));
