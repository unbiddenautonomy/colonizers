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

/** Church, Faith & Reformation goes on top of Cities & Knights, in place of Greed, Wealth & Power. */
export function churchOn(
  settings: Pick<RoomSettings, 'church' | 'map'>,
  ck: boolean,
  gwp: boolean,
): boolean {
  return ck && !gwp && settings.church && settings.map.kind !== 'special';
}

/** Witches, Wizards & Dragons goes on top of Cities & Knights, in place of Greed, Wealth & Power. */
export function witchesOn(
  settings: Pick<RoomSettings, 'witches' | 'map'>,
  ck: boolean,
  gwp: boolean,
): boolean {
  return ck && !gwp && settings.witches && settings.map.kind !== 'special';
}

/**
 * Princes & Explorers goes on the usual maps and Seafarers, on the base game or Cities &
 * Knights, but not yet with the special maps or the other fan expansions.
 */
export function princesOn(
  settings: Pick<RoomSettings, 'princes' | 'map'>,
  otherFan: boolean,
): boolean {
  const kind = settings.map.kind;
  return settings.princes && !otherFan && kind !== 'special';
}

/**
 * Soldiers & Armies goes on the usual maps, Seafarers and the Explorers &
 * Pirates scenarios, on the base game or Cities & Knights, and with Princes &
 * Explorers. Its rules with the other fan expansions come later.
 */
export function soldiersOn(
  settings: Pick<RoomSettings, 'soldiers' | 'map'>,
  otherFan: boolean,
): boolean {
  const map = settings.map;
  const special = map.kind === 'special' ? specialMapById(map.id) : undefined;
  const ok = map.kind !== 'special' || special?.group === 'explorers';
  return settings.soldiers && !otherFan && ok;
}

/**
 * Investors & Speculators goes on the usual maps, Seafarers, the Explorers &
 * Pirates and Traders & Barbarians scenarios, with or without Cities & Knights
 * (and Witches, Church or Greed, Wealth & Power on it), World Wonders,
 * Princes & Explorers and Soldiers & Armies.
 */
export function investorsOn(settings: Pick<RoomSettings, 'investors' | 'map'>): boolean {
  const map = settings.map;
  const special = map.kind === 'special' ? specialMapById(map.id) : undefined;
  const ok =
    map.kind !== 'special' || special?.group === 'explorers' || special?.group === 'traders';
  return settings.investors && ok;
}

/**
 * Kingdoms & Warriors goes on the usual maps and Seafarers, on the base game
 * or Cities & Knights, and with Investors & Speculators.
 */
export function kingdomsOn(
  settings: Pick<RoomSettings, 'kingdoms' | 'map'>,
  others: boolean,
): boolean {
  return settings.kingdoms && !others && settings.map.kind !== 'special';
}

/**
 * Land & Water goes on the base game or Cities & Knights, on the usual maps
 * and the Seafarers scenarios without fog (its vehicles don't explore). The
 * other expansions come later.
 */
export function landWaterOn(
  settings: Pick<RoomSettings, 'landWater' | 'map'>,
  others: boolean,
): boolean {
  const map = settings.map;
  if (!settings.landWater || others || map.kind === 'special') return false;
  return map.kind !== 'scenario' || seaScenarioById(map.id)?.fog !== true;
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
  const church = churchOn(settings, ck, gwp);
  const witches = witchesOn(settings, ck, gwp);
  const princes = princesOn(settings, gwp || church || witches || wondersOn(settings));
  const soldiers = soldiersOn(settings, gwp || church || witches || wondersOn(settings));
  const investors = investorsOn(settings);
  const kingdoms = kingdomsOn(
    settings,
    princes || soldiers || gwp || church || witches || wondersOn(settings),
  );
  const landWater = landWaterOn(
    settings,
    gwp || church || witches || princes || soldiers || investors || kingdoms || wondersOn(settings),
  );
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
      ],
      ck,
      gwp,
      wondersOn(settings),
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
