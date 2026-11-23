import { paintedBoard } from './painted.tsx';

/**
 * One Piece: the combined board. Painted lands with an icon on each, a deep blue sea, and pieces
 * and figures from the One Piece sheets, finished in each player's colour. Law carries the
 * settler cargo.
 *
 * Shared for now: the metropolis towers (from Basic Clean, so they take the player's colour) and
 * the player ship (from Casino; the sheets have only the pirate ship).
 */
export const onePieceBoard = paintedBoard({
  id: 'one-piece',
  name: 'One Piece',
  description: 'The Grand Line: painted lands, the crews as figures and pieces in your colour.',
  folder: 'onepiece',
  land: {
    forest: '#2d5a3a',
    hills: '#b5603e',
    pasture: '#8cc152',
    fields: '#e2b23a',
    mountains: '#6b7b8c',
    desert: '#e8dcc0',
  },
  rareLand: { castle: '#eee8dc', quarry: '#6b6b6b' },
  sea: '#1f4f8f',
  ink: '#1c1a1a',
  robber: '#d9d9d9',
});
