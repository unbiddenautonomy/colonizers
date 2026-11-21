import { crestRest, crestToken } from './crest.tsx';
import { paintedBoard } from './painted.tsx';

/**
 * Casino · Emerald & Burgundy: felt-green and lacquer lands with gold-leaf objects, a dark teal
 * sea, a yacht for a city and a mobster in a burgundy suit for the robber.
 */
export const casinoEmeraldBoard = paintedBoard({
  id: 'casino-emerald',
  name: 'Casino · Emerald & Burgundy',
  description: 'Felt green, burgundy and gold leaf: high rollers, yachts and a mobster robber.',
  folder: 'casino',
  land: {
    forest: '#1e5a45',
    hills: '#4f6e5e',
    pasture: '#1f4d36',
    fields: '#9c8a5a',
    mountains: '#3a434a',
    desert: '#c8b383',
  },
  sea: '#123c3e',
  ink: '#1a0f0f',
  robber: '#5e1620',
  token: crestToken,
  rest: crestRest,
});
