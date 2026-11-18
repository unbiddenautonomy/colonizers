import { seaScenarioById, specialMapById } from '@colonizers/maps';
import { TDA_CK_ADJUST, TDA_VP_BONUS } from '@colonizers/module-treasures-dragons';
import { EP_VP_BONUS } from '@colonizers/module-explorers-pirates';
import { PRINCES_EXTRA_VP } from '@colonizers/module-princes-explorers';
import { KINGDOMS_EXTRA_VP } from '@colonizers/module-kingdoms-warriors';
import { LAND_WATER_CK_EXTRA_VP, LAND_WATER_EXTRA_VP } from '@colonizers/module-land-water';
import { SOLDIERS_EXTRA_VP } from '@colonizers/module-soldiers-armies';
import type { ModeId } from '@colonizers/modes';

/** The usual target. A room stores its choice as this plus the change from the game's own target. */
export const BASE_TARGET = 10;
/** How far a host may move the target from the game's own, either way. */
export const TARGET_RANGE = 5;
/** No game plays to fewer points than this. */
export const MIN_TARGET = 5;

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

/** Points the expansion scenarios' own modules add to the target in play. */
const SCENARIO_VP: Record<string, number> = {
  caravans: 2,
  traders: 3,
  ...TDA_VP_BONUS,
  ...EP_VP_BONUS,
};

/** The part of a room's map the target depends on (scenario and special maps have their own). */
export interface TargetMap {
  kind: string;
  id?: string;
}

/** One piece of a game's target, counted from the usual 10. */
export interface TargetPart {
  label: string;
  points: number;
}

export interface WinTarget {
  /** The target the official rules give this game. A new game starts on it. */
  standard: number;
  /** The target we suggest. Usually the standard one. */
  recommended: number;
  /** Why the suggestion differs from the standard target, when it does. */
  advice: string | null;
  /** How the standard target is made up, beyond the usual 10. */
  parts: TargetPart[];
  /** Points the game's own modules add in play (so the settings carry the rest). */
  fromModules: number;
  /** The targets a host may pick, lowest first. */
  choices: number[];
}

/**
 * Mixes that run long or tend to stall at the official target, with a lower target to suggest.
 * From bot test games; kept short on purpose.
 */
const ADVICE: {
  when: (map: TargetMap, on: ReadonlySet<ModeId>) => boolean;
  minus: number;
  why: string;
}[] = [
  {
    when: (map, on) => map.kind === 'special' && map.id === 'great-canal' && on.has('strategist'),
    minus: 2,
    why: 'with Strategist & Commander this map runs very long: bot test games took 180 rounds or more, against about 30 for a usual Cities & Knights game.',
  },
  {
    when: (map) => map.kind === 'special' && map.id === 'great-canal',
    minus: 2,
    why: 'this map runs long: bot test games took 40 to 130 rounds, against about 30 for a usual Cities & Knights game.',
  },
];

/** Points the expansions add, whatever the map. Matches the server's game set-up. */
export function expansionParts(on: ReadonlySet<ModeId>): TargetPart[] {
  const ck = on.has('citiesKnights');
  const church = on.has('church');
  const witches = on.has('witches');
  const parts: TargetPart[] = [];
  if (on.has('civilisations')) parts.push({ label: 'Civilisations', points: CIV_EXTRA_VP });
  else if (on.has('greedWealthPower'))
    parts.push({ label: 'Greed, Wealth & Power', points: GWP_EXTRA_VP });
  else if (ck)
    parts.push({
      label:
        church && witches
          ? 'Church and Witches'
          : church
            ? 'Church, Faith & Reformation'
            : witches
              ? 'Witches, Wizards & Dragons'
              : 'Cities & Knights',
      points: fanExtraVp(church, witches),
    });
  if (on.has('princes')) parts.push({ label: 'Princes & Explorers', points: PRINCES_EXTRA_VP });
  // With Princes & Explorers, its target stands (14, or 17 with Cities & Knights).
  else if (on.has('soldiers'))
    parts.push({ label: 'Soldiers & Armies', points: SOLDIERS_EXTRA_VP });
  if (on.has('kingdoms')) parts.push({ label: 'Kingdoms & Warriors', points: KINGDOMS_EXTRA_VP });
  // With Cities & Knights it plays to 14, one more than that expansion's 13.
  if (on.has('landWater'))
    parts.push({
      label: 'Land & Water',
      points: ck ? LAND_WATER_CK_EXTRA_VP : LAND_WATER_EXTRA_VP,
    });
  return parts;
}

/** The scenario's own share of the target, and whether its module adds it in play. */
function scenarioPart(
  map: TargetMap,
  players: number,
  ck: boolean,
): { points: number; inPlay: boolean } {
  const id = map.id ?? '';
  if (map.kind === 'scenario') {
    const sea = seaScenarioById(id);
    return { points: sea ? sea.vpTarget(players) - BASE_TARGET : 0, inPlay: false };
  }
  if (map.kind !== 'special') return { points: 0, inPlay: false };
  const special = specialMapById(id);
  // A map that doesn't fit the table falls back to a random one, with no scenario points.
  if (!special || players < special.players.min || players > special.players.max)
    return { points: 0, inPlay: false };
  const adjust = ck ? (TDA_CK_ADJUST[id as keyof typeof TDA_CK_ADJUST] ?? 0) : 0;
  return { points: (SCENARIO_VP[id] ?? 0) + adjust, inPlay: true };
}

/** The target a game plays to by the rules, what we suggest, and the choices a host has. */
export function winTarget(map: TargetMap, players: number, modes: Iterable<ModeId>): WinTarget {
  const on = new Set(modes);
  const parts = expansionParts(on);
  const scenario = scenarioPart(map, players, on.has('citiesKnights'));
  if (scenario.points !== 0) parts.push({ label: 'the scenario', points: scenario.points });
  const standard = parts.reduce((sum, p) => sum + p.points, BASE_TARGET);
  const tip = ADVICE.find((a) => a.when(map, on));
  const low = Math.max(MIN_TARGET, standard - TARGET_RANGE);
  const choices: number[] = [];
  for (let v = low; v <= standard + TARGET_RANGE; v++) choices.push(v);
  const recommended = tip ? Math.max(low, standard - tip.minus) : standard;
  return {
    standard,
    recommended,
    advice: tip && recommended !== standard ? tip.why : null,
    parts,
    fromModules: scenario.inPlay ? scenario.points : 0,
    choices,
  };
}

/** The target a room plays to: its stored choice is the usual 10 plus the change it made. */
export function chosenTarget(target: WinTarget, stored: number): number {
  const v = target.standard + stored - BASE_TARGET;
  return Math.min(Math.max(v, target.choices[0] ?? v), target.choices.at(-1) ?? v);
}

/** What a room stores for a picked target. */
export function storedTarget(target: WinTarget, picked: number): number {
  return BASE_TARGET + picked - target.standard;
}

/** How the standard target is made up, e.g. "+3 for Cities & Knights, -2 for the scenario". */
export function describeParts(parts: TargetPart[]): string {
  return parts
    .map((p) => `${p.points > 0 ? '+' : '−'}${Math.abs(p.points)} for ${p.label}`)
    .join(', ');
}
