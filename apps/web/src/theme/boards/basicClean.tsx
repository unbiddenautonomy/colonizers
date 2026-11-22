import { paintedBoard } from './painted.tsx';

/**
 * Basic Clean: each land one calm colour with its object on it, logs, bricks, a sheep, a sheaf,
 * crystals and plain sand, on a blue sea. Simple white house and boat pieces in the player's
 * colour, and a gentleman in a plum coat for the robber.
 */
export const basicCleanBoard = paintedBoard({
  id: 'basic-clean',
  name: 'Basic Clean',
  description: 'Calm flat colours, one object to a land, and simple house and boat pieces.',
  folder: 'clean',
  land: {
    forest: '#1b2924',
    hills: '#62242a',
    pasture: '#84a86c',
    fields: '#edb53e',
    mountains: '#475465',
    desert: '#c2b197',
  },
  sea: '#1f5a8a',
  ink: '#1c2939',
  robber: '#5a2340',
});
