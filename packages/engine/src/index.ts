export const ENGINE_VERSION = '0.1.0';

export { Rng, hashSeed, type RngState } from './rng.ts';
export { rollDice, type DiceRoll } from './dice.ts';
export * from './hex.ts';
export { buildGeometry, connectedRegions, type Geometry } from './board.ts';
export type * from './types.ts';
export { RuleError, rule } from './errors.ts';
export {
  buildRegistry,
  resolveModules,
  type ActionDef,
  type CardTypeDef,
  type DeckDef,
  type DiceResult,
  type GameModule,
  type HexTypeDef,
  type Hooks,
  type PieceTypeDef,
  type Reducers,
  type Registry,
} from './module.ts';
export { Ctx } from './context.ts';
export {
  ModuleLibrary,
  stateFromView,
  HIDDEN_CARD,
  type GameConfig,
  type GameView,
} from './game.ts';
export { cardsTotal, addCards, subtractCards, isCards } from './cards.ts';
