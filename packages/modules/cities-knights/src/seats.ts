import type { Action, ActionDef, Cards, CornerId, Ctx, HexState, Piece } from '@colonizers/engine';
import { ALL_TRACKS, EVENT_FACES, TRACKS, type EventFace, type Track } from './constants.ts';
import { ckData } from './rules.ts';

/**
 * Things the fan expansions add to Cities & Knights, shared so each is built
 * once:
 *
 * - **Extra tracks.** A module lists tracks under the `ckAddTracks` setting.
 *   At the start of a game the tracks of every module in it are joined, and
 *   the event die grows to match: a ship for each track plus one, a gate for
 *   each track, and a joker.
 * - **Level 4 rivals.** Tracks listed under `ckExclusiveLevel` shut each other
 *   out: level 4 in one stops the others at level 3.
 * - **City seats.** A module describes one under `ckCitySeat`: a city that
 *   becomes, say, a Diocese (Church, Faith & Reformation) or a Citadel
 *   (Witches, Wizards & Dragons). It is worth a point, makes the track's
 *   commodity on one terrain, and is needed for that track's improvements and
 *   cards. A city can be only one seat, and each player has at most one of
 *   each.
 */

export interface CitySeat {
  /** Also the cost key and the piece prop, e.g. 'diocese'. */
  id: string;
  name: string;
  track: Track;
  /** The resource whose second card becomes the commodity. */
  resource: string;
  commodity: string;
  /** Taken off the city's and the seat's price when a settlement goes straight to a seat. */
  settlementDiscount?: Cards;
}

const settingsOf = (ctx: Ctx) => ctx.registry.modules.map((m) => m.settings ?? {});

/** Every city seat the modules in this game add. */
export function citySeats(ctx: Ctx): CitySeat[] {
  return settingsOf(ctx).flatMap((s) => (s.ckCitySeat ? [s.ckCitySeat as CitySeat] : []));
}

export const seatDef = (ctx: Ctx, id: string): CitySeat | undefined =>
  citySeats(ctx).find((s) => s.id === id);

export const seatForTrack = (ctx: Ctx, track: Track): CitySeat | undefined =>
  citySeats(ctx).find((s) => s.track === track);

/** The event die for this many tracks: one more ship than tracks, a gate each and a joker. */
export function jokerDie(tracks: readonly Track[]): EventFace[] {
  if (tracks.length <= TRACKS.length) return [...EVENT_FACES];
  return [...Array<EventFace>(tracks.length + 1).fill('ship'), ...tracks, 'joker'];
}

/** At the start of a game: joins the modules' extra tracks and sets the die to match. */
export function setUpTracks(ctx: Ctx): void {
  const s = ctx.state.settings;
  const added = new Set(settingsOf(ctx).flatMap((m) => (m.ckAddTracks as Track[]) ?? []));
  const exclusive = new Set(settingsOf(ctx).flatMap((m) => (m.ckExclusiveLevel as Track[]) ?? []));
  if (exclusive.size && !s.exclusiveLevel) s.exclusiveLevel = [...exclusive];
  if (!added.size || s.ckTracks) return;
  const tracks = ALL_TRACKS.filter(
    (t) => (TRACKS as readonly string[]).includes(t) || added.has(t),
  );
  s.ckTracks = tracks;
  s.ckEventFaces ??= jokerDie(tracks);
}

// ---- City seats ----

type SeatData = Record<string, Record<number, CornerId>>;

const seatData = (ctx: Ctx): SeatData => (ckData(ctx).seats ??= {}) as SeatData;

/** Where a player's seat of this kind stands, if they have one. */
export function seatOf(ctx: Ctx, id: string, seat: number): CornerId | null {
  const d = ctx.state.data['cities-knights']?.seats as SeatData | undefined;
  return d?.[id]?.[seat] ?? null;
}

/** The seat a city is, if any. */
export const seatAt = (p: Piece | undefined): string | null =>
  typeof p?.props.seat === 'string' ? p.props.seat : null;

/** Does this player have what the track needs (its seat, when it has one)? */
export function seatAllows(ctx: Ctx, seat: number, track: Track): boolean {
  const def = seatForTrack(ctx, track);
  return !def || seatOf(ctx, def.id, seat) !== null;
}

/** The price of a seat here: the seat, and the city first for a settlement (less any discount). */
export function seatPrice(ctx: Ctx, seat: number, id: string, corner: CornerId): Cards {
  const def = seatDef(ctx, id);
  const out: Cards = { ...ctx.cost(id, seat) };
  if (ctx.buildingAt(corner)?.type !== 'settlement') return out;
  for (const [c, n] of Object.entries(ctx.cost('city', seat))) out[c] = (out[c] ?? 0) + n;
  for (const [c, n] of Object.entries(def?.settlementDiscount ?? {}))
    out[c] = Math.max(0, (out[c] ?? 0) - n);
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0));
}

export function seatBlock(ctx: Ctx, seat: number, id: string, corner: CornerId): string | null {
  const def = seatDef(ctx, id);
  if (!def) return 'Nothing to build';
  if (seatOf(ctx, id, seat) !== null) return `You already have a ${def.name}`;
  const b = ctx.buildingAt(corner);
  if (!b || b.owner !== seat || (b.type !== 'city' && b.type !== 'settlement'))
    return 'Pick one of your cities or settlements';
  const other = seatAt(b);
  if (other) return `That city is already a ${seatDef(ctx, other)?.name ?? other}`;
  if (b.type === 'settlement' && ctx.supplyLeft(seat, 'city') <= 0) return 'No cities left';
  return ctx.has(seat, seatPrice(ctx, seat, id, corner)) ? null : 'You can not afford it';
}

const buildCitySeat: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    return seatBlock(ctx, a.player, a.seat as string, a.corner as CornerId);
  },
  apply(ctx, a) {
    const id = a.seat as string;
    const corner = a.corner as CornerId;
    ctx.pay(a.player, seatPrice(ctx, a.player, id, corner));
    let city = ctx.buildingAt(corner)!;
    if (city.type === 'settlement') {
      city = ctx.upgrade(city, 'city');
      ctx.emit({ type: 'built', player: a.player, piece: 'city', at: corner });
    }
    city.props.seat = id;
    (seatData(ctx)[id] ??= {})[a.player] = corner;
    ctx.emit({ type: 'citySeatBuilt', player: a.player, seat: id, at: corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    for (const def of citySeats(ctx)) {
      if (seatOf(ctx, def.id, player) !== null) continue;
      for (const p of ctx.piecesOf(player))
        if (p.at.kind === 'corner' && !seatBlock(ctx, player, def.id, p.at.id))
          out.push({ type: 'buildCitySeat', player, seat: def.id, corner: p.at.id });
    }
    return out;
  },
};

export const seatActions: Record<string, ActionDef> = { buildCitySeat };

/** A seat knocked back to a settlement (or taken away) is gone. */
export function dropLostSeats(ctx: Ctx): void {
  const d = ctx.state.data['cities-knights']?.seats as SeatData | undefined;
  if (!d) return;
  for (const [id, bySeat] of Object.entries(d)) {
    for (const [seat, corner] of Object.entries(bySeat)) {
      const b = ctx.buildingAt(corner);
      if (b && b.type === 'city' && b.owner === Number(seat) && seatAt(b) === id) continue;
      if (b && seatAt(b) === id) delete b.props.seat;
      delete seatData(ctx)[id]![Number(seat)];
      ctx.emit({ type: 'citySeatLost', player: Number(seat), seat: id, at: corner });
    }
  }
}

/** A seat's city on its terrain makes the commodity in place of its second resource. */
export function seatYield(ctx: Ctx, hex: HexState, piece: Piece, value: Cards): Cards {
  const id = seatAt(piece);
  if (!id) return value;
  const def = seatDef(ctx, id);
  if (!def || ctx.registry.hexTypes[hex.type]?.produces !== def.resource) return value;
  if ((value[def.resource] ?? 0) < 2) return value;
  return {
    ...value,
    [def.resource]: (value[def.resource] ?? 0) - 1,
    [def.commodity]: (value[def.commodity] ?? 0) + 1,
  };
}

/** A point for each seat. */
export function seatVp(ctx: Ctx, seat: number): number {
  const d = ctx.state.data['cities-knights']?.seats as SeatData | undefined;
  return Object.values(d ?? {}).filter((bySeat) => bySeat[seat] !== undefined).length;
}
