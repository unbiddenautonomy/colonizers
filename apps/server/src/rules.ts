import { ModuleLibrary, type Action, type GameConfig, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { variantsModule } from '@colonizers/module-variants';
import { specialMapsModule } from '@colonizers/module-special-maps';
import {
  generateBoard,
  generateSeaBoard,
  generateSpecialBoard,
  PRESETS,
  seaScenarioById,
  specialMapById,
} from '@colonizers/maps';
import { moduleList, optionSettings, type RoomSettings } from './protocol.ts';

/** Every rules module the server knows. Expansions are added here as they ship. */
export const library = new ModuleLibrary([
  baseModule,
  seafarersModule,
  specialMapsModule,
  variantsModule,
  citiesKnightsModule,
]);

/** Cities & Knights adds metropolises and defender points, so games go 3 points longer. */
export const CK_EXTRA_VP = 3;

/** Builds the game for a room or a game on one device. Names are already in seat order. */
export function buildConfig(settings: RoomSettings, names: string[], seed: string): GameConfig {
  const n = names.length;
  const ck = settings.citiesKnights;
  const extraVp = ck ? CK_EXTRA_VP : 0;
  const options = optionSettings(settings.options, n);
  const config = (
    extra: string[],
    map: GameConfig['map'],
    own: Record<string, unknown>,
  ): GameConfig => ({
    seed,
    players: names,
    modules: moduleList(extra, ck),
    map,
    settings: { ...options, ...own },
    fixedSeats: true,
  });
  if (settings.map.kind === 'scenario' && seaScenarioById(settings.map.id)) {
    const sea = generateSeaBoard({ seed: `${seed}-map`, players: n, scenario: settings.map.id });
    // The scenario sets its own target; the host's choice only applies to other maps.
    return config(['seafarers'], sea.map, {
      ...sea.settings,
      vpTarget: Number(sea.settings.vpTarget) + extraVp,
    });
  }
  const special = settings.map.kind === 'special' ? specialMapById(settings.map.id) : undefined;
  if (special && n >= special.players.min && n <= special.players.max) {
    const b = generateSpecialBoard({ seed: `${seed}-map`, players: n, map: special.id });
    return config(b.modules, b.map, { ...b.settings, vpTarget: settings.vpTarget + extraVp });
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
  return config([], map, { vpTarget: settings.vpTarget + extraVp });
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
  'endSpecialBuild',
  'discard',
  'pickGold',
  'pillageCity',
  'pickDefenderCard',
  'returnProgress',
  'harborGive',
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
