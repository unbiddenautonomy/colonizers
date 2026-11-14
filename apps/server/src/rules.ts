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
import { churchModule } from '@colonizers/module-church';
import { witchesModule } from '@colonizers/module-witches';
import { princesModule, PRINCES_EXTRA_VP } from '@colonizers/module-princes-explorers';
import { kingdomsModule, KINGDOMS_EXTRA_VP } from '@colonizers/module-kingdoms-warriors';
import {
  landWaterCkModule,
  landWaterModule,
  LAND_WATER_CK_EXTRA_VP,
  LAND_WATER_EXTRA_VP,
} from '@colonizers/module-land-water';
import { strategistModule } from '@colonizers/module-strategist';
import { soldiersModule, SOLDIERS_EXTRA_VP } from '@colonizers/module-soldiers-armies';
import { investorsModule } from '@colonizers/module-investors-speculators';
import {
  generateBoard,
  generateSeaBoard,
  generateSpecialBoard,
  PRESETS,
  seaScenarioById,
  specialMapById,
} from '@colonizers/maps';
import { MODES, resolve, type BoardInfo, type ModeId } from '@colonizers/modes';
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
  churchModule,
  witchesModule,
  greedWealthPowerModule,
  civilisationsModule,
  princesModule,
  kingdomsModule,
  landWaterModule,
  landWaterCkModule,
  strategistModule,
  soldiersModule,
  investorsModule,
]);

/** Cities & Knights adds metropolises and defender points, so games go 3 points longer. */
export const CK_EXTRA_VP = 3;
/** Greed, Wealth & Power plays to 18 with the usual 10. */
export const GWP_EXTRA_VP = 8;
/** Civilisations plays to 20 with the usual 10. */
export const CIV_EXTRA_VP = 10;
/** Church, Faith & Reformation plays to 15 with the usual 10, and so does Witches, Wizards & Dragons. */
export const CHURCH_EXTRA_VP = 5;
/** Both together play to 17. */
export const CHURCH_WITCHES_EXTRA_VP = 7;

/** Extra points for the Church and Witches fan expansions (Cities & Knights' 3 when neither). */
export function fanExtraVp(church: boolean, witches: boolean): number {
  if (church && witches) return CHURCH_WITCHES_EXTRA_VP;
  return church || witches ? CHURCH_EXTRA_VP : CK_EXTRA_VP;
}

/** What the shared mode rules need to know about the room's map. */
export function boardInfo(map: RoomSettings['map']): BoardInfo {
  if (map.kind === 'scenario')
    return { kind: 'seafarers', fog: seaScenarioById(map.id)?.fog === true };
  if (map.kind === 'special') {
    const special = specialMapById(map.id);
    return {
      kind: 'special',
      group: special?.group ?? null,
      needsCk: special?.needsCitiesKnights === true,
      noCk: special?.noCitiesKnights === true,
    };
  }
  return { kind: 'usual' };
}

/** The modes a room asked for, by their shared ids. */
export function wantedModes(settings: RoomSettings): ModeId[] {
  return MODES.filter((m) => settings[m] === true);
}

/** Builds the game for a room or a game on one device. Names are already in seat order. */
export function buildConfig(settings: RoomSettings, names: string[], seed: string): GameConfig {
  const n = names.length;
  // One rule for every mix, shared with the new-game screens.
  const on = resolve(boardInfo(settings.map), wantedModes(settings));
  const ck = on.has('citiesKnights');
  const gwp = on.has('greedWealthPower');
  const civs = on.has('civilisations');
  const church = on.has('church');
  const witches = on.has('witches');
  const wonders = on.has('worldWonders');
  const princes = on.has('princes');
  const soldiers = on.has('soldiers');
  const investors = on.has('investors');
  const kingdoms = on.has('kingdoms');
  const landWater = on.has('landWater');
  const strategist = on.has('strategist');
  const extraVp =
    (civs ? CIV_EXTRA_VP : gwp ? GWP_EXTRA_VP : ck ? fanExtraVp(church, witches) : 0) +
    (princes ? PRINCES_EXTRA_VP : 0) +
    // With Princes & Explorers, its target stands (14, or 17 with Cities & Knights).
    (soldiers && !princes ? SOLDIERS_EXTRA_VP : 0) +
    (kingdoms ? KINGDOMS_EXTRA_VP : 0) +
    // With Cities & Knights it plays to 14, one more than that expansion's 13.
    (landWater ? (ck ? LAND_WATER_CK_EXTRA_VP : LAND_WATER_EXTRA_VP) : 0);
  const options = optionSettings(settings.options, n);
  // Princes & Explorers has no Special Building Phase, and its robber goes by its own rules.
  if (princes) {
    if (options.turnMode === 'specialBuild') options.turnMode = 'normal';
    options.friendlyRobber = false;
  }
  // Soldiers & Armies marches after building, so there's no Special Building Phase either.
  if (soldiers && options.turnMode === 'specialBuild') options.turnMode = 'normal';
  const config = (
    extra: string[],
    map: GameConfig['map'],
    own: Record<string, unknown>,
  ): GameConfig => ({
    seed,
    players: names,
    modules: moduleList(
      [
        ...extra,
        ...(princes ? ['princes'] : []),
        ...(soldiers ? ['soldiers'] : []),
        ...(investors ? ['investors'] : []),
        ...(kingdoms ? ['kingdoms'] : []),
        ...(landWater ? ['landwater'] : []),
        ...(strategist ? ['strategist'] : []),
      ],
      ck,
      gwp,
      wonders,
      civs,
      church,
      witches,
    ),
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
  // Soldiers & Armies: the defender decides whether their armies join a battle.
  if (state.phase.id === 'battleCall') return [state.phase.defender as number];
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
  'desertUnit',
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
  'espionageTake',
  'summonRemove',
  'naiadHex',
  'pickWildCard',
  'bishopMove',
  'diplomatRemove',
  'intrigueKnight',
  'placeDeserterKnight',
  'smithPromote',
  'placeFreeUnit',
  'intrigueUnit',
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
  'pickJoker',
  'keepOne',
  'churchTaxPay',
  'passAttack',
  'answerVeto',
  'formulaGive',
  'magicPick',
  'movePrince',
  'exploreSwap',
  'placePrincesRobber',
  'placeFreeMarker',
  'battleRetreat',
  'seaBattleBreak',
  'sevenShow',
  'sevenRates',
  'sevenKeep',
  'payRobberToll',
  'answerBattleCall',
  'payMerchantToll',
  'relocateMerchant',
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
    // Nor uses a Magic Veto.
    if (type === 'answerVeto') options = options.filter((a) => a.use === false);
    if (type === 'civCurse') options = options.filter((a) => a.target === null);
    if (type === 'civColony') options = options.filter((a) => a.civ !== 'redraw');
    // Nor swaps numbers for the explorers.
    if (type === 'exploreSwap') options = options.filter((a) => a.hexes === null);
    // Nor calls up armies to a battle.
    if (type === 'answerBattleCall') options = options.filter((a) => a.join === false);
    if (options.length) return options[Math.floor(rand() * options.length)] ?? null;
  }
  return null;
}
