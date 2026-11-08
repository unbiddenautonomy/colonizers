import { RESOURCE_OF } from './components.ts';
import { isRed, pips, type Layout, type ShapeInfo } from './layout.ts';

/** Hard rules a board must pass (PLAN.md section 3.3). */
export const HARD_RULES = {
  /** No 6 or 8 touches another 6 or 8. */
  redApart: 'No 6 or 8 touches another 6 or 8',
  /** No two identical numbers touch. */
  sameNumberApart: 'No two identical numbers touch',
  /** 2 and 12 don't touch each other. */
  extremesApart: '2 and 12 do not touch',
  /** No three hexes of the same terrain in one connected cluster. */
  noTerrainClusters: 'No three hexes of the same terrain together',
  /** The red tokens sit on at least three different resources. */
  redSpread: '6s and 8s are on at least three resources',
  /** Every resource has at least one hex with 4 or more pips. */
  everyResourceStrong: 'Every resource has a hex with 4+ pips',
} as const;

export type HardRule = keyof typeof HARD_RULES;
export type RuleSet = Partial<Record<HardRule, boolean>>;

/** Number of rule-breaking spots for one hex's token (used to repair boards). */
export function tokenConflicts(info: ShapeInfo, layout: Layout, rules: RuleSet, i: number): number {
  const t = layout.tokens[i] ?? null;
  if (t === null) return 0;
  let n = 0;
  for (const j of info.neighbours[i] ?? []) {
    const u = layout.tokens[j] ?? null;
    if (u === null) continue;
    if (rules.redApart && isRed(t) && isRed(u)) n++;
    else if (rules.sameNumberApart && t === u) n++;
    else if (rules.extremesApart && ((t === 2 && u === 12) || (t === 12 && u === 2))) n++;
  }
  return n;
}

function clusterTooBig(info: ShapeInfo, layout: Layout): boolean {
  const seen = new Uint8Array(layout.terrain.length);
  for (let i = 0; i < layout.terrain.length; i++) {
    if (seen[i] || !RESOURCE_OF[layout.terrain[i] as string]) continue;
    const t = layout.terrain[i];
    let size = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const h = stack.pop() as number;
      size++;
      if (size >= 3) return true;
      for (const n of info.neighbours[h] ?? []) {
        if (!seen[n] && layout.terrain[n] === t) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
  }
  return false;
}

export function terrainOk(info: ShapeInfo, layout: Layout, rules: RuleSet): boolean {
  return !(rules.noTerrainClusters && clusterTooBig(info, layout));
}

/** Lists the hard rules a board breaks. Empty means it passes. */
export function brokenRules(info: ShapeInfo, layout: Layout, rules: RuleSet): HardRule[] {
  const broken = new Set<HardRule>();
  for (let i = 0; i < layout.tokens.length; i++) {
    const t = layout.tokens[i] ?? null;
    if (t === null) continue;
    for (const j of info.neighbours[i] ?? []) {
      const u = layout.tokens[j] ?? null;
      if (u === null) continue;
      if (rules.redApart && isRed(t) && isRed(u)) broken.add('redApart');
      if (rules.sameNumberApart && t === u) broken.add('sameNumberApart');
      if (rules.extremesApart && ((t === 2 && u === 12) || (t === 12 && u === 2)))
        broken.add('extremesApart');
    }
  }
  if (rules.noTerrainClusters && clusterTooBig(info, layout)) broken.add('noTerrainClusters');
  if (rules.redSpread) {
    const res = new Set<string>();
    layout.tokens.forEach((t, i) => {
      if (isRed(t ?? null)) res.add(RESOURCE_OF[layout.terrain[i] as string] ?? '');
    });
    if (res.size < 3) broken.add('redSpread');
  }
  if (rules.everyResourceStrong) {
    const strong = new Set<string>();
    layout.tokens.forEach((t, i) => {
      if (pips(t) >= 4) strong.add(RESOURCE_OF[layout.terrain[i] as string] ?? '');
    });
    if (['brick', 'lumber', 'wool', 'grain', 'ore'].some((r) => !strong.has(r)))
      broken.add('everyResourceStrong');
  }
  return [...broken];
}
