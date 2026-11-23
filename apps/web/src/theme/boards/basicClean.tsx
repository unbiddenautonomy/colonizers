import { paintedBoard } from './painted.tsx';

/**
 * Basic Clean: each land one flat colour with a plain object on it, logs, bricks, a sheep, a
 * sheaf, crystals and a dune, on a blue sea. Pieces and figures are white line drawings the game
 * tints per player; markers (walls, metropolises, cargo, barbarians …) are small paintings.
 */
export const basicCleanBoard = paintedBoard({
  id: 'basic-clean',
  name: 'Basic Clean',
  description: 'Calm flat colours, one object to a land, and simple white pieces.',
  folder: 'basic',
  land: {
    forest: '#224232',
    hills: '#b84a39',
    pasture: '#6fa365',
    fields: '#dfb968',
    mountains: '#64748b',
    desert: '#e2d3b5',
  },
  rareLand: {
    gold: '#d4a024',
    volcano: '#3a2628',
    lake: '#3b8ea5',
    fishingLake: '#2b7a78',
    swamp: '#59613b',
    oasis: '#d9c59e',
    // White, so the grey castle never reads as the grey quarry.
    castle: '#f3f0ea',
    quarry: '#78716c',
    glassworks: '#bfd7ea',
    hidden: '#dce4ea',
  },
  sea: '#1e6091',
  ink: '#1c2939',
  robber: '#5a2340',
  // The white ship sails to the right, so its stern is on the left.
  rest: { shipBow: 'right' },
});
