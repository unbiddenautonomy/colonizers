import { ModuleLibrary, type Action, type GameConfig, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { citiesKnightsModule } from '@colonizers/module-cities-knights';
import { variantsModule } from '@colonizers/module-variants';
import { specialMapsModule } from '@colonizers/module-special-maps';
import { tradersBarbariansModule } from '@colonizers/module-traders-barbarians';
import { treasuresDragonsModule } from '@colonizers/module-treasures-dragons';
import { explorersPiratesModule } from '@colonizers/module-explorers-pirates';
import { greedWealthPowerModule } from '@colonizers/module-greed-wealth-power';
import { worldWondersModule } from '@colonizers/module-world-wonders';
import { civilisationsModule } from '@colonizers/module-civilisations';
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
  tradersBarbariansModule,
  treasuresDragonsModule,
  explorersPiratesModule,
  variantsModule,
  worldWondersModule,
  citiesKnightsModule,
  greedWealthPowerModule,
  civilisationsModule,
]);

/** Cities & Knights adds metropolises and defender points, so games go 3 points longer. */
export const CK_EXTRA_VP = 3;
/** Greed, Wealth & Power plays to 18 with the usual 10. */
export const GWP_EXTRA_VP = 8;
/** Civilisations plays to 20 with the usual 10. */
export const CIV_EXTRA_VP = 10;

/** Greed, Wealth & Power goes on top of Cities & Knights, on the usual maps and Seafarers. */
export function gwpOn(
  settings: Pick<RoomSettings, 'greedWealthPower' | 'map'>,
  ck: boolean,
): boolean {
  return ck && settings.greedWealthPower && settings.map.kind !== 'special';
}

/** World Wonders goes on the usual maps and Seafarers, with or without Cities & Knights. */
export function wondersOn(settings: Pick<RoomSettings, 'worldWonders' | 'map'>): boolean {
  return settings.worldWonders && settings.map.kind !== 'special';
}

/** Civilisations goes on top of Greed, Wealth & Power. */
export function civsOn(settings: Pick<RoomSettings, 'civilisations'>, gwp: boolean): boolean {
  return gwp && settings.civilisations;
}

/** Builds the game for a room or a game on one device. Names are already in seat order. */
export function buildConfig(settings: RoomSettings, names: string[], seed: string): GameConfig {
  const n = names.length;
  const picked = settings.map.kind === 'special' ? specialMapById(settings.map.id) : undefined;
  // Traders & Barbarians scenarios are base-game only.
  const ck =
    (settings.citiesKnights || picked?.needsCitiesKnights === true) && !picked?.noCitiesKnights;
  const gwp = gwpOn(settings, ck);
  const civs = civsOn(settings, gwp);
  const extraVp = civs ? CIV_EXTRA_VP : gwp ? GWP_EXTRA_VP : ck ? CK_EXTRA_VP : 0;
  const options = optionSettings(settings.options, n);
  const config = (
    extra: string[],
    map: GameConfig['map'],
    own: Record<string, unknown>,
  ): GameConfig => ({
    seed,
    players: names,
    modules: moduleList(extra, ck, gwp, wondersOn(settings), civs),
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
  const custom = settings.map.kind === 'custom' ? settings.map.map : undefined;
  if (custom && n >= custom.players.min && n <= custom.players.max)
    return config([], custom, { vpTarget: settings.vpTarget + extraVp });
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
  'treasureProgress',
  'eventPick',
  'camelBid',
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
  'passIndulgence',
  'keepRoll',
  'placeNeutral',
  'placeDamsel',
  'brothelAnswer',
  'ritualGive',
  'keepProgress',
  'espionageTake',
  'summonRemove',
  'naiadHex',
  'pickWildCard',
  'bishopMove',
  'diplomatRemove',
  'intrigueKnight',
  'placeDeserterKnight',
  'smithPromote',
  'harborSwap',
  'placeTbKnight',
  'moveEdgeBarbarian',
  'pickCiv',
  'civNeutral',
  'civDemocracy',
  'civMuscovy',
  'civMuscovyHex',
  'civHabsburgKeep',
  'civCurse',
  'civColony',
  'civRaidCity',
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
    let options = legal.filter((a) => a.type === type);
    // A camel vote from the timer never spends cards.
    if (type === 'camelBid') options = options.filter((a) => a.wool === 0 && a.grain === 0);
    // The timer keeps Greece's dice and lets the roller place their own robber.
    if (type === 'civDemocracy') options = options.filter((a) => a.dice === 'keep');
    if (type === 'civMuscovy') options = options.filter((a) => a.use === false);
    if (type === 'civCurse') options = options.filter((a) => a.target === null);
    if (type === 'civColony') options = options.filter((a) => a.civ !== 'redraw');
    if (options.length) return options[Math.floor(rand() * options.length)] ?? null;
  }
  return null;
}
