import {
  cornerHexes,
  edgeCorners,
  edgeHexes,
  hexCorners,
  hexEdges,
  hexId,
  hexNeighbours,
  parseHexId,
  Rng,
  type CornerId,
  type EdgeId,
  type Harbor,
  type HexId,
} from '@colonizers/engine';
import type { MapFile } from './mapfile.ts';

/**
 * The map editor's model: a draft of land and sea hexes with numbers and
 * harbors, and the checks and helpers around it. The web editor draws it;
 * the server checks drafts that come in with an online room.
 */

export const EDITOR_LAND = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'] as const;
export const EDITOR_TERRAIN = [...EDITOR_LAND, 'sea'] as const;
export type EditorTerrain = (typeof EDITOR_TERRAIN)[number];

export const EDITOR_NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as const;
export const HARBOR_KINDS = ['any', 'brick', 'lumber', 'wool', 'grain', 'ore'] as const;

/** One of each number, twice for 3 to 11: the usual mix, repeated for big boards. */
const NUMBER_MIX = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const RESOURCE_OF: Record<string, string> = {
  forest: 'lumber',
  hills: 'brick',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
};

/** The most hexes a custom map may have, sea included, and how far out they may go. */
export const MAX_HEXES = 200;
export const MAX_RADIUS = 8;

export interface DraftHex {
  q: number;
  r: number;
  type: string;
  token?: number;
}

export interface MapDraft {
  id: string;
  name: string;
  description: string;
  players: { min: number; max: number };
  hexes: DraftHex[];
  harbors: Harbor[];
}

export const isLandType = (t: string) => (EDITOR_LAND as readonly string[]).includes(t);
const key = (h: { q: number; r: number }) => hexId(h.q, h.r);

/** Pips: ways to roll a number with two dice. */
const pips = (t?: number) => (t ? 6 - Math.abs(7 - t) : 0);

/** A new draft: the classic island shape, all fields of grass, ready to paint. */
export function blankDraft(name = 'My map'): MapDraft {
  const hexes: DraftHex[] = [];
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) hexes.push({ q, r, type: 'pasture' });
  return {
    id: slugify(name),
    name,
    description: '',
    players: { min: 2, max: 4 },
    hexes: frameWithSea(hexes),
    harbors: [],
  };
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return s || 'custom-map';
}

/** Adds sea all around the land, where nothing is drawn yet. */
export function frameWithSea(hexes: DraftHex[]): DraftHex[] {
  const have = new Set(hexes.map(key));
  const out = [...hexes];
  for (const h of hexes) {
    if (!isLandType(h.type)) continue;
    for (const n of hexNeighbours(key(h))) {
      if (have.has(n)) continue;
      have.add(n);
      const { q, r } = parseHexId(n);
      out.push({ q, r, type: 'sea' });
    }
  }
  return out;
}

/** Edges where land meets sea (or the edge of the drawing): where harbors can go. */
export function coastEdges(hexes: DraftHex[]): EdgeId[] {
  const type = new Map(hexes.map((h) => [key(h), h.type]));
  const out = new Set<EdgeId>();
  for (const h of hexes) {
    if (!isLandType(h.type)) continue;
    for (const e of hexEdges(h.q, h.r)) {
      const other = edgeHexes(e).find((x) => x !== key(h))!;
      const t = type.get(other);
      if (t === undefined || t === 'sea') out.add(e);
    }
  }
  return [...out].sort();
}

/** Corners where a settlement could stand, best first, packed by the distance rule. */
export function startingSpots(hexes: DraftHex[]): number[] {
  const land = new Map(hexes.filter((h) => isLandType(h.type)).map((h) => [key(h), h]));
  const corners = new Set<CornerId>();
  for (const h of land.values()) for (const c of hexCorners(h.q, h.r)) corners.add(c);
  const value = (c: CornerId) => cornerHexes(c).reduce((s, x) => s + pips(land.get(x)?.token), 0);
  // Neighbouring corners share an edge.
  const near = new Map<CornerId, Set<CornerId>>();
  for (const h of land.values())
    for (const e of hexEdges(h.q, h.r)) {
      const [a, b] = edgeCorners(e);
      if (!near.has(a)) near.set(a, new Set());
      if (!near.has(b)) near.set(b, new Set());
      near.get(a)!.add(b);
      near.get(b)!.add(a);
    }
  const taken = new Set<CornerId>();
  const out: number[] = [];
  for (const c of [...corners].sort((a, b) => value(b) - value(a) || (a < b ? -1 : 1))) {
    if (taken.has(c) || [...(near.get(c) ?? [])].some((n) => taken.has(n))) continue;
    if (value(c) === 0) continue;
    taken.add(c);
    out.push(value(c));
  }
  return out;
}

export interface DraftCheck {
  /** Problems that stop the map being played. */
  errors: string[];
  /** Things worth a second look, which don't stop play. */
  warnings: string[];
}

/** What's wrong with a draft, if anything, for this many players at most. */
export function checkDraft(d: MapDraft): DraftCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = d.name.trim();
  if (!name) errors.push('Give the map a name.');
  if (name.length > 40) errors.push('The name is too long (40 letters at most).');
  if (d.description.length > 200) errors.push('The description is too long (200 letters at most).');
  const { min, max } = d.players;
  if (!(Number.isInteger(min) && Number.isInteger(max) && min >= 2 && max <= 8 && min <= max))
    errors.push('Players must be between 2 and 8.');
  if (d.hexes.length > MAX_HEXES) errors.push(`Too many hexes (${MAX_HEXES} at most).`);
  const seen = new Set<string>();
  for (const h of d.hexes) {
    if (!Number.isInteger(h.q) || !Number.isInteger(h.r)) errors.push('A hex is off the grid.');
    else if (Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r)) > MAX_RADIUS)
      errors.push('A hex is too far from the middle.');
    if (seen.has(key(h))) errors.push('A hex is drawn twice.');
    seen.add(key(h));
    if (!(EDITOR_TERRAIN as readonly string[]).includes(h.type))
      errors.push(`Unknown terrain "${h.type}".`);
  }
  const land = d.hexes.filter((h) => isLandType(h.type));
  if (land.length < 3) errors.push('Draw at least 3 land hexes.');
  const noNumber = land.filter((h) => h.type !== 'desert' && h.token === undefined).length;
  if (noNumber)
    errors.push(
      `${noNumber} land hex${noNumber === 1 ? ' needs a number' : 'es need numbers'} (or use Random numbers).`,
    );
  if (d.hexes.some((h) => (h.type === 'desert' || h.type === 'sea') && h.token !== undefined))
    errors.push('Deserts and sea take no number.');
  if (
    d.hexes.some(
      (h) => h.token !== undefined && !(EDITOR_NUMBERS as readonly number[]).includes(h.token),
    )
  )
    errors.push('A number is not one the dice can roll.');
  const coast = new Set(coastEdges(d.hexes));
  const harborEdges = new Set<string>();
  for (const hb of d.harbors) {
    if (!coast.has(hb.edge)) errors.push('A harbor is not on the coast.');
    if (harborEdges.has(hb.edge)) errors.push('Two harbors share an edge.');
    harborEdges.add(hb.edge);
    if (!(HARBOR_KINDS as readonly string[]).includes(hb.resource))
      errors.push('A harbor trades something unknown.');
    if (hb.ratio !== (hb.resource === 'any' ? 3 : 2)) errors.push('A harbor has the wrong rate.');
  }
  if (!noNumber && land.length >= 3) {
    const spots = startingSpots(d.hexes).length;
    if (spots < 2 * max)
      errors.push(
        `Only ${spots} settlement spots fit: ${max} players need ${2 * max}. Add land or lower the player count.`,
      );
  }
  // Worth a look.
  const kinds = new Set(land.map((h) => RESOURCE_OF[h.type]).filter(Boolean));
  const missing = Object.values(RESOURCE_OF).filter((r) => !kinds.has(r));
  if (land.length >= 3 && missing.length)
    warnings.push(
      `No hex makes ${missing.join(', ')}: that can only come from harbors and trades.`,
    );
  const red = new Set(land.filter((h) => h.token === 6 || h.token === 8).map(key));
  for (const h of red)
    if (hexNeighbours(h).some((n) => red.has(n))) {
      warnings.push('Two red numbers (6 or 8) sit side by side.');
      break;
    }
  if (land.length >= 3 && !connected(land))
    warnings.push('The land is in more than one piece; roads can not cross the sea.');
  return { errors, warnings };
}

function connected(land: DraftHex[]): boolean {
  const all = new Set(land.map(key));
  const first = land[0];
  if (!first) return true;
  const seen = new Set<HexId>([key(first)]);
  const queue: HexId[] = [key(first)];
  while (queue.length) {
    const h = queue.pop()!;
    for (const n of hexNeighbours(h))
      if (all.has(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return seen.size === all.size;
}

/** Deals numbers onto the land (not deserts), keeping 6s and 8s apart where it can. */
export function randomNumbers(d: MapDraft, seed: string): MapDraft {
  const rng = Rng.fromSeed(`editor-numbers:${seed}`);
  const land = d.hexes.filter((h) => isLandType(h.type) && h.type !== 'desert');
  const bag: number[] = [];
  while (bag.length < land.length) bag.push(...NUMBER_MIX);
  let best: Map<HexId, number> | null = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const nums = rng.shuffle(bag.slice()).slice(0, land.length);
    const at = new Map(land.map((h, i) => [key(h), nums[i]!]));
    best = at;
    const ok = land.every((h) => {
      const t = at.get(key(h))!;
      if (t !== 6 && t !== 8) return true;
      return hexNeighbours(key(h)).every((n) => {
        const u = at.get(n);
        return u !== 6 && u !== 8;
      });
    });
    if (ok) break;
  }
  return {
    ...d,
    hexes: d.hexes.map((h) => {
      const t = best?.get(key(h));
      const out: DraftHex = { q: h.q, r: h.r, type: h.type };
      if (t !== undefined) out.token = t;
      return out;
    }),
  };
}

/** Spreads harbors around the coast: a 2:1 for each resource, then 3:1s. */
export function randomHarbors(d: MapDraft, seed: string): MapDraft {
  const rng = Rng.fromSeed(`editor-harbors:${seed}`);
  const coast = rng.shuffle(coastEdges(d.hexes));
  const land = d.hexes.filter((h) => isLandType(h.type)).length;
  const want = Math.max(1, Math.round(land / 2.1));
  const picked: EdgeId[] = [];
  const used = new Set<CornerId>();
  for (const e of coast) {
    if (picked.length >= want) break;
    // No two harbors share a corner or sit right next to each other.
    const ends = edgeCorners(e);
    if (ends.some((c) => used.has(c))) continue;
    picked.push(e);
    for (const c of ends) used.add(c);
  }
  const kinds: string[] = rng.shuffle(['brick', 'lumber', 'wool', 'grain', 'ore']);
  const harbors = picked.map((edge, i) => {
    const resource = kinds[i] ?? 'any';
    return { edge, resource, ratio: resource === 'any' ? 3 : 2 };
  });
  return { ...d, harbors };
}

/** The draft as a playable map file: sea all around, and the robber in a desert. */
export function draftToMapFile(d: MapDraft): MapFile {
  const hexes = frameWithSea(d.hexes).map((h) => ({ ...h }));
  const desert = hexes.find((h) => h.type === 'desert');
  return {
    id: slugify(d.id || d.name),
    name: d.name.trim(),
    description: d.description.trim(),
    players: { ...d.players },
    modules: ['base'],
    hexes,
    harbors: d.harbors.map((h) => ({ ...h })),
    ...(desert && { pieces: [{ type: 'robber', at: { kind: 'hex' as const, id: key(desert) } }] }),
  };
}

/** The reverse, for editing a saved map again. */
export function mapFileToDraft(f: MapFile): MapDraft {
  return {
    id: f.id,
    name: f.name,
    description: f.description ?? '',
    players: { ...f.players },
    hexes: f.hexes.map((h) => ({
      q: h.q,
      r: h.r,
      type: h.type,
      ...(h.token !== undefined && { token: h.token }),
    })),
    harbors: (f.harbors ?? []).map((h) => ({ ...h })),
  };
}

/**
 * Checks a custom map that arrives from outside (a file, or an online room)
 * and returns a clean copy, or the problems with it.
 */
export function cleanCustomMap(raw: unknown): { map: MapFile } | { errors: string[] } {
  if (typeof raw !== 'object' || !raw) return { errors: ['That is not a map.'] };
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const players = (o.players ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.hexes) || o.hexes.length > MAX_HEXES)
    return { errors: ['The map has no hexes, or far too many.'] };
  const hexes: DraftHex[] = [];
  for (const h of o.hexes as Record<string, unknown>[]) {
    if (typeof h !== 'object' || !h) return { errors: ['A hex is not readable.'] };
    const hex: DraftHex = { q: Number(h.q), r: Number(h.r), type: str(h.type, 20) };
    if (h.token !== undefined) hex.token = Number(h.token);
    hexes.push(hex);
  }
  const harborsRaw = Array.isArray(o.harbors) ? (o.harbors as Record<string, unknown>[]) : [];
  if (harborsRaw.length > 40) return { errors: ['Too many harbors.'] };
  const harbors: Harbor[] = [];
  for (const h of harborsRaw) {
    const edge = str(h?.edge, 30);
    if (!/^e:-?\d+,-?\d+,(NE|E|SE)$/.test(edge)) return { errors: ['A harbor is not on an edge.'] };
    harbors.push({ edge: edge as EdgeId, resource: str(h.resource, 10), ratio: Number(h.ratio) });
  }
  const draft: MapDraft = {
    id: slugify(str(o.id, 40) || str(o.name, 40)),
    name: str(o.name, 41),
    description: str(o.description, 201),
    players: { min: Number(players.min), max: Number(players.max) },
    hexes,
    harbors,
  };
  const { errors } = checkDraft(draft);
  return errors.length ? { errors } : { map: draftToMapFile(draft) };
}
