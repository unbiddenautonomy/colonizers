import { RESOURCE_OF } from './components.ts';
import {
  bestStartingSpots,
  cornerValue,
  fairShares,
  pipsPerResource,
  shapeInfo,
  type Layout,
  type ShapeInfo,
} from './layout.ts';
import { brokenRules, HARD_RULES, type HardRule } from './rules.ts';
import { scoreParts, totalScore, type ScoreParts } from './score.ts';
import type { Harbor, MapSpec } from '@colonizers/engine';

export type Grade = 'A' | 'B' | 'C';

export interface FairnessReport {
  /** Pips (ways to roll, out of 36) on each resource. */
  pipsPerResource: Record<string, number>;
  /** Each resource's fair share of pips, by hex count. */
  fairShare: Record<string, number>;
  /** Values (in pips) of the best 2N starting spots, best first. */
  startingSpots: number[];
  /** Pips of the single best corner. */
  bestCorner: number;
  /** Balanced-mode rules this board breaks (it may still be a valid Classic or Wild board). */
  brokenRules: HardRule[];
  parts: ScoreParts;
  score: number;
  grade: Grade;
}

export const ALL_RULES = Object.fromEntries(
  Object.keys(HARD_RULES).map((k) => [k, true]),
) as Record<HardRule, boolean>;

export function gradeOf(
  parts: ScoreParts,
  report: { pipsPerResource: Record<string, number>; fairShare: Record<string, number> },
): Grade {
  const maxDev = Math.max(
    ...Object.keys(report.fairShare).map((r) =>
      Math.abs((report.pipsPerResource[r] ?? 0) - (report.fairShare[r] ?? 0)),
    ),
  );
  if (parts.startSpread <= 3 && maxDev <= 3 && parts.monsterSpot === 0) return 'A';
  if (parts.startSpread <= 5 && maxDev <= 5 && parts.monsterSpot <= 1) return 'B';
  return 'C';
}

export function reportFor(
  info: ShapeInfo,
  layout: Layout,
  players: number,
  harbors: Harbor[],
): FairnessReport {
  const parts = scoreParts(info, layout, players, harbors);
  const per = pipsPerResource(layout);
  const fair = fairShares(layout);
  let best = 0;
  for (let c = 0; c < info.corners.length; c++) best = Math.max(best, cornerValue(info, layout, c));
  const base = { pipsPerResource: per, fairShare: fair };
  return {
    ...base,
    startingSpots: bestStartingSpots(info, layout, players * 2),
    bestCorner: best,
    brokenRules: brokenRules(info, layout, ALL_RULES),
    parts,
    score: totalScore(parts),
    grade: gradeOf(parts, base),
  };
}

/** Fairness report for any map, including presets and hand-made maps. */
export function analyzeMap(map: MapSpec, players: number): FairnessReport {
  const land = map.hexes.filter((h) => RESOURCE_OF[h.type] || h.type === 'desert');
  const info = shapeInfo(land.map((h) => ({ q: h.q, r: h.r })));
  const layout: Layout = {
    terrain: land.map((h) => h.type),
    tokens: land.map((h) => h.token ?? null),
  };
  return reportFor(info, layout, players, map.harbors ?? []);
}
