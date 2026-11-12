import { ModuleLibrary, type Action, type GameConfig, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { generateBoard, generateSeaBoard, PRESETS, seaScenarioById } from '@colonizers/maps';
import type { RoomSettings } from './protocol.ts';

/** Every rules module the server knows. Expansions are added here as they ship. */
export const library = new ModuleLibrary([baseModule, seafarersModule, citiesKnightsModule]);

/** Cities & Knights adds metropolises and defender points, so games go 3 points longer. */
export const CK_EXTRA_VP = 3;

/** Builds the game for a room. Names are already in seat order. */
export function buildConfig(settings: RoomSettings, names: string[], seed: string): GameConfig {
  const n = names.length;
  const ck = settings.citiesKnights ? ['cities-knights'] : [];
  if (settings.map.kind === 'scenario' && seaScenarioById(settings.map.id)) {
    const sea = generateSeaBoard({ seed: `${seed}-map`, players: n, scenario: settings.map.id });
    return {
      seed,
      players: names,
      modules: ['base', 'seafarers', ...ck],
      map: sea.map,
      // The scenario sets its own target; the host's choice only applies to the base game.
      settings: {
        ...sea.settings,
        vpTarget: Number(sea.settings.vpTarget) + (ck.length ? CK_EXTRA_VP : 0),
      },
      fixedSeats: true,
    };
  }
  const preset =
    settings.map.kind === 'preset'
      ? PRESETS.find(
          (p) =>
            settings.map.kind === 'preset' &&
            p.id === settings.map.id &&
            n >= p.players.min &&
            n <= p.players.max,
        )
      : undefined;
  const mode = settings.map.kind === 'random' ? settings.map.mode : 'classic';
  const map = preset ?? generateBoard({ seed: `${seed}-map`, players: n, mode }).map;
  return {
    seed,
    players: names,
    modules: ['base', ...ck],
    map,
    settings: { vpTarget: settings.vpTarget + (ck.length ? CK_EXTRA_VP : 0) },
    fixedSeats: true,
  };
}

/** Seats the turn timer is waiting on. */
export function timedSeats(state: GameState): number[] {
  if (state.winner !== null) return [];
  if (state.phase.owed) {
    return Object.keys(state.phase.owed as Record<number, number>).map(Number);
  }
  return [state.turn.player];
}

/** Changes whenever a new stretch of the timer should start. */
export function timerKey(state: GameState): string {
  const p = state.phase;
  return JSON.stringify([
    p.id,
    p.step ?? null,
    p.index ?? null,
    state.turn.number,
    state.turn.player,
  ]);
}

const SAFE_ORDER = [
  'discard',
  'pickGold',
  'pillageCity',
  'pickDefenderCard',
  'aqueductPick',
  'placeMetropolis',
  'relocateKnight',
  'desertKnight',
  'giveGift',
  'ckDone',
  'takeCards',
  'takeProgress',
  'placeFreeWall',
  'inventorPick',
  'medicineCity',
  'merchantHex',
  'bishopMove',
  'diplomatRemove',
  'intrigueKnight',
  'placeDeserterKnight',
  'smithPromote',
  'harborSwap',
  'roll',
  'placeSetupSettlement',
  'placeSetupRoad',
  'placeSetupShip',
  'moveRobber',
  'steal',
  'placeFreeRoad',
  'cancelTrade',
  'endTurn',
];

/**
 * The move the room plays for someone whose time ran out: the smallest step
 * that keeps the game going. Bots replace this in a later phase.
 */
export function timeoutAction(state: GameState, seat: number, rand: () => number): Action | null {
  const legal = library.legalActions(state, seat);
  for (const type of SAFE_ORDER) {
    const options = legal.filter((a) => a.type === type);
    if (options.length) return options[Math.floor(rand() * options.length)] ?? null;
  }
  return null;
}
