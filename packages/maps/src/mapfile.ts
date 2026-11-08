import type { Harbor, MapSpec } from '@colonizers/engine';

/**
 * A map file (JSON). Preset boards, special maps and scenarios are all map
 * files, so new ones can be added without code.
 */
export interface MapFile extends MapSpec {
  id: string;
  name: string;
  description: string;
  players: { min: number; max: number };
  /** Rule modules the map needs, e.g. ["base"] or ["base", "seafarers"]. */
  modules: string[];
  /** Setting overrides, e.g. a different VP target. */
  settings?: Record<string, unknown>;
  harbors: Harbor[];
}

export interface MapFileProblem {
  message: string;
}

/** Checks a map file's structure. Rule-level checks happen when a game is created. */
export function validateMapFile(file: MapFile): string[] {
  const problems: string[] = [];
  if (!file.id || !/^[a-z0-9-]+$/.test(file.id))
    problems.push('id must be lowercase letters, digits and dashes');
  if (!file.name) problems.push('name is required');
  if (!(file.players.min >= 1 && file.players.max >= file.players.min))
    problems.push('players range is invalid');
  if (!file.modules.length) problems.push('at least one module is required');
  const seen = new Set<string>();
  for (const h of file.hexes) {
    const k = `${h.q},${h.r}`;
    if (seen.has(k)) problems.push(`hex ${k} is listed twice`);
    seen.add(k);
    if (h.token !== undefined && ![2, 3, 4, 5, 6, 8, 9, 10, 11, 12].includes(h.token)) {
      problems.push(`hex ${k} has an invalid number ${h.token}`);
    }
  }
  return problems;
}
