import { RESOURCE_OF } from './components.ts';
import {
  bestStartingSpots,
  cornerValue,
  fairShares,
  pips,
  pipsPerResource,
  type Layout,
  type ShapeInfo,
} from './layout.ts';
import type { Harbor } from '@colonizers/engine';

export interface ScoreWeights {
  resourcePips: number;
  startSpread: number;
  monsterSpot: number;
  regions: number;
  harbors: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  resourcePips: 1,
  startSpread: 1.5,
  monsterSpot: 2,
  regions: 0.5,
  harbors: 1,
};

/** A corner worth more than this many pips is a "monster spot". */
export const MONSTER_CAP = 13;

export interface ScoreParts {
  resourcePips: number;
  startSpread: number;
  monsterSpot: number;
  regions: number;
  harbors: number;
}

/** Lower is fairer. Each part is in rough "pips" units. */
export function scoreParts(
  info: ShapeInfo,
  layout: Layout,
  players: number,
  harbors: Harbor[] = [],
): ScoreParts {
  const per = pipsPerResource(layout);
  const fair = fairShares(layout);
  let resourcePips = 0;
  for (const r of Object.keys(fair)) resourcePips += Math.abs((per[r] ?? 0) - (fair[r] ?? 0));

  const spots = bestStartingSpots(info, layout, players * 2);
  const startSpread = spots.length ? (spots[0] as number) - (spots[spots.length - 1] as number) : 0;

  let best = 0;
  for (let c = 0; c < info.corners.length; c++) best = Math.max(best, cornerValue(info, layout, c));
  const monsterSpot = Math.max(0, best - MONSTER_CAP);

  const sectorPips = [0, 0, 0, 0, 0, 0];
  layout.tokens.forEach((t, i) => {
    const s = info.sectors[i] as number;
    sectorPips[s] = (sectorPips[s] ?? 0) + pips(t);
  });
  const mean = sectorPips.reduce((s, x) => s + x, 0) / 6;
  const regions = Math.sqrt(sectorPips.reduce((s, x) => s + (x - mean) ** 2, 0) / 6);

  let harborPenalty = 0;
  for (const h of harbors) {
    if (h.resource === 'any') continue;
    const coast = info.coast.find((c) => c.edge === h.edge);
    if (!coast) continue;
    const hexes = new Set<number>([coast.hex]);
    for (const n of info.neighbours[coast.hex] ?? []) hexes.add(n);
    for (const i of hexes) {
      if (RESOURCE_OF[layout.terrain[i] as string] === h.resource && pips(layout.tokens[i]) >= 4)
        harborPenalty += 2;
    }
  }
  return { resourcePips, startSpread, monsterSpot, regions, harbors: harborPenalty };
}

export function totalScore(parts: ScoreParts, w: ScoreWeights = DEFAULT_WEIGHTS): number {
  return (
    parts.resourcePips * w.resourcePips +
    parts.startSpread * w.startSpread +
    parts.monsterSpot * w.monsterSpot +
    parts.regions * w.regions +
    parts.harbors * w.harbors
  );
}
