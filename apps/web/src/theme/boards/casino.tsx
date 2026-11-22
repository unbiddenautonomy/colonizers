import { crestRest, crestToken } from './crest.tsx';
import { paintedBoard } from './painted.tsx';

/**
 * Casino · Emerald & Burgundy: painted, textured lands (pine forest, red clay, wheat, slate …)
 * each with a bold icon on top, a deep night sea, crisp white pieces in the player's colour and
 * a bearded robber in red.
 *
 * Still borrowed from Basic Clean until the casino add-ons sheet arrives (src/art/casino/):
 * barb1-3, camel, cargo-*, citadel, crown, diocese, festival, metro-*, monument, nukemark,
 * prince, silo, village.
 */
export const casinoEmeraldBoard = paintedBoard({
  id: 'casino-emerald',
  name: 'Casino · Emerald & Burgundy',
  description: 'Rich painted lands with bold icons, a night sea and crisp white pieces.',
  folder: 'casino',
  land: {
    forest: '#15553a',
    hills: '#7a3a26',
    pasture: '#3f6a3c',
    fields: '#b9902e',
    mountains: '#3a4352',
    desert: '#a89474',
  },
  rareLand: { castle: '#ece6da', quarry: '#8d8c88' },
  sea: '#102a44',
  ink: '#1a0f0f',
  robber: '#5e1620',
  token: crestToken,
  // The pirate ship in ivory: a dark one is lost on the night-teal sea.
  rest: { ...crestRest, pirate: '#efe4c8' },
});
