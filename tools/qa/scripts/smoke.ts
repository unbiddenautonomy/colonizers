import { runSim } from './sim-core.ts';
const r = runSim({ name: 'base-4', settings: {}, players: 4, seed: 'smoke-1' });
const { actionTypes, eventTypes, ...rest } = r;
console.log(JSON.stringify(rest, null, 1));
console.log(JSON.stringify(actionTypes));
console.log(JSON.stringify(eventTypes));
