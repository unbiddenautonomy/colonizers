import type { Action, CornerId, Ctx, EdgeId, HexId, Piece } from '@colonizers/engine';
import {
  ckData,
  citiesOf,
  isActive,
  isAway,
  isKnight,
  knightStrength,
  knightsOf,
} from '@colonizers/module-cities-knights';

export const MODULE_ID = 'strategist';
export const JUNKER = 'junker';
export const DUKE_CARD = 'sfDuke';
export const SCHOLAR_CARD = 'sfScholar';
/** Five of each card join the decks. */
export const NEUTRAL_CARDS = 5;
/** The strongest a knight can get from its own Duke, and the weakest from a rival's. */
export const DUKE_MAX = 3;
export const DUKE_MIN = 1;

export interface SfData extends Record<string, unknown> {
  /** The player who rolled doubles and puts the Junker down once the roll is worked out. */
  junkerDue: number | null;
}

export function sfData(ctx: Ctx): SfData {
  const d = ctx.data<Partial<SfData>>(MODULE_ID);
  d.junkerDue ??= null;
  return d as SfData;
}

// ---- The Junker ----

export function junker(ctx: Ctx): Piece | undefined {
  return ctx.piecesOfType(JUNKER)[0];
}

export function junkerHex(ctx: Ctx): HexId | null {
  const j = junker(ctx);
  return j?.at.kind === 'hex' ? j.at.id : null;
}

export function junkerCorners(ctx: Ctx): readonly CornerId[] {
  const h = junkerHex(ctx);
  return h ? (ctx.geometry.hexCorners.get(h) ?? []) : [];
}

export function junkerEdges(ctx: Ctx): readonly EdgeId[] {
  const h = junkerHex(ctx);
  return h ? (ctx.geometry.hexEdges.get(h) ?? []) : [];
}

export const frozenCorner = (ctx: Ctx, c: unknown): boolean =>
  typeof c === 'string' && junkerCorners(ctx).includes(c as CornerId);

export const frozenEdge = (ctx: Ctx, e: unknown): boolean =>
  typeof e === 'string' && junkerEdges(ctx).includes(e as EdgeId);

/** Stands on a corner of the Junker's field: the barbarians don't see it. */
export function fogged(ctx: Ctx, p: Piece): boolean {
  return p.at.kind === 'corner' && frozenCorner(ctx, p.at.id);
}

/** Before the barbarians first reach Catan, the Junker stays where it first lands. */
export function junkerCanMove(ctx: Ctx): boolean {
  return !junker(ctx) || ckData(ctx).attacks > 0;
}

/** Land fields the Junker may go to: any but the one it stands on. */
export function junkerHexes(ctx: Ctx): HexId[] {
  const here = junkerHex(ctx);
  return (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => {
    const hex = ctx.state.hexes[h];
    if (!hex || hex.hidden || h === here) return false;
    return ctx.registry.hexTypes[hex.type]?.terrain === 'land';
  });
}

const FROZEN = 'The Junker has frozen that field';

/** Building, or moving a piece onto or off the Junker's field. */
export function freezeBlock(ctx: Ctx, a: Action): string | null {
  if (!junker(ctx)) return null;
  if (frozenCorner(ctx, a.corner) || frozenEdge(ctx, a.edge)) return FROZEN;
  return null;
}

/** A knight on the Junker's field can't leave it, and no knight can go there. */
export function knightMoveBlock(ctx: Ctx, a: Action): string | null {
  if (!junker(ctx)) return null;
  const k = ctx.state.pieces[a.knight as string];
  if (k && fogged(ctx, k)) return FROZEN;
  return frozenCorner(ctx, a.to) ? FROZEN : null;
}

/** Cities the Junker hides from the barbarians. */
export function foggedCities(ctx: Ctx): number {
  if (!junker(ctx)) return 0;
  const shelter = ckData(ctx).sheltered ?? [];
  return ctx.state.players.reduce(
    (s, p) =>
      s +
      citiesOf(ctx, p.seat).filter(
        (c) => fogged(ctx, c) && !(c.at.kind === 'corner' && shelter.includes(c.at.id)),
      ).length,
    0,
  );
}

/** Strength of a player's defending knights the Junker hides. */
export function foggedStrength(ctx: Ctx, seat: number): number {
  if (!junker(ctx)) return 0;
  const shelter = ckData(ctx).sheltered ?? [];
  return knightsOf(ctx, seat)
    .filter(
      (k) =>
        isActive(k) &&
        !isAway(k) &&
        fogged(ctx, k) &&
        !(k.at.kind === 'corner' && shelter.includes(k.at.id)),
    )
    .reduce((s, k) => s + knightStrength(ctx, k), 0);
}

// ---- The Duke and the Scholar ----

/** The knight the Duke stands beside, and whose Duke it is. */
export function duke(ctx: Ctx): { knight: Piece; owner: number } | null {
  for (const p of Object.values(ctx.state.pieces))
    if (isKnight(p) && typeof p.props.duke === 'number') return { knight: p, owner: p.props.duke };
  return null;
}

/** Knights the Duke can go to: any on the board, except the one it's already with for you. */
export function dukeTargets(ctx: Ctx, seat: number): Piece[] {
  return Object.values(ctx.state.pieces).filter(
    (p) => isKnight(p) && p.at.kind === 'corner' && p.props.duke !== seat,
  );
}

export interface ScholarMark {
  owner: number;
  /** Barbarian attacks so far when it was placed: it leaves at the next. */
  attacks: number;
}

export function scholar(ctx: Ctx): { building: Piece; mark: ScholarMark } | null {
  for (const p of Object.values(ctx.state.pieces)) {
    const m = p.props.scholar as ScholarMark | undefined;
    if (m && typeof m.owner === 'number') return { building: p, mark: m };
  }
  return null;
}

/** Still working: no barbarian attack since it was placed. */
export function scholarWorks(ctx: Ctx, m: ScholarMark): boolean {
  return ckData(ctx).attacks <= m.attacks;
}

export function isBuilding(ctx: Ctx, p: Piece): boolean {
  return p.at.kind === 'corner' && p.owner !== null && !!ctx.registry.pieceTypes[p.type]?.building;
}

/** Settlements and cities the Scholar can go to. */
export function scholarTargets(ctx: Ctx, seat: number): CornerId[] {
  const s = scholar(ctx);
  return Object.values(ctx.state.pieces)
    .filter((p) => isBuilding(ctx, p) && !(s?.building.id === p.id && s.mark.owner === seat))
    .map((p) => (p.at as { id: CornerId }).id);
}
