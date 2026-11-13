import type { Action, ActionDef, CornerId, Ctx, HexId, HexState, Piece } from '@colonizers/engine';
import { robber } from '@colonizers/module-base';
import {
  canAct,
  ckData,
  isActive,
  isKnight,
  knightAt,
  knightStrength,
} from '@colonizers/module-cities-knights';
import { MODULE_ID } from './constants.ts';
import { festivalBlock } from './festival.ts';

/**
 * Greed, Wealth & Power's Damsel and dragon, and two cards played ahead of
 * time: Alliance and Lent.
 *
 * - **Damsel**: whoever rolls doubles puts her on any land hex. Cities beside
 *   her don't count for the barbarians and can't be lost; knights beside her
 *   can't act or defend (and stay active after an attack); nobody can build
 *   beside her; the robber can't steal on her hex. She leaves after every
 *   attack, and when the dragon or a neutral piece lands on her hex.
 * - **Dragon**: after the first attack, a 7 lets the roller move the dragon
 *   (or take it off the board) instead of the robber. It goes beside a knight,
 *   switches off the basic and strong knights next to it, and its hex makes
 *   nothing. A strong knight or the Wizard chases it off; a mighty knight (or
 *   a hero) slays it for good and takes the 2-point Dragon Slayer card.
 *   Dragon Lair puts it on an ore hex and takes the number away until a mighty
 *   knight slays it.
 */

export const DRAGON = 'gwpDragon';
export const DAMSEL = 'damsel';

export interface DragonData extends Record<string, unknown> {
  /** Seat that slew the dragon (it never comes back). */
  slayer?: number | null;
  /** Doubles were rolled: this seat places the Damsel once the roll is done. */
  damselDue?: number | null;
  /** Lent: the target can't build on their next turn until they pay. */
  lent?: { target: number; by: number; turn: number | null; paid: boolean } | null;
}

export function dragonData(ctx: Ctx): DragonData {
  return ctx.data<DragonData>(MODULE_ID);
}

export const dragonPiece = (ctx: Ctx): Piece | undefined => ctx.piecesOfType(DRAGON)[0];
export const damselPiece = (ctx: Ctx): Piece | undefined => ctx.piecesOfType(DAMSEL)[0];

const hexOf = (p: Piece | undefined): HexId | null => (p?.at.kind === 'hex' ? p.at.id : null);
const cornersOf = (ctx: Ctx, h: HexId | null): CornerId[] =>
  h ? [...(ctx.geometry.hexCorners.get(h) ?? [])] : [];

function landHex(ctx: Ctx, h: HexId): boolean {
  const hex = ctx.state.hexes[h];
  return !!hex && !hex.hidden && ctx.registry.hexTypes[hex.type]?.terrain === 'land';
}

export function dragonGone(ctx: Ctx): boolean {
  return typeof dragonData(ctx).slayer === 'number';
}

// ---- The Damsel ----

export function damselHexes(ctx: Ctx): HexId[] {
  const here = hexOf(damselPiece(ctx));
  const dragon = hexOf(dragonPiece(ctx));
  return (Object.keys(ctx.state.hexes) as HexId[]).filter(
    (h) => landHex(ctx, h) && h !== here && h !== dragon,
  );
}

function removeDamsel(ctx: Ctx, why: string): void {
  const d = damselPiece(ctx);
  if (!d) return;
  ctx.remove(d);
  ctx.emit({ type: 'damselLeft', why });
}

const placeDamsel: ActionDef = {
  phases: ['placeDamsel'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    return damselHexes(ctx).includes(a.hex as HexId) ? null : 'The Damsel can not go there';
  },
  apply(ctx, a) {
    const at = { kind: 'hex', id: a.hex as HexId } as const;
    const d = damselPiece(ctx);
    if (d) ctx.move(d, at);
    else ctx.place(DAMSEL, null, at);
    (damselPiece(ctx) as Piece).props.attacks = ckData(ctx).attacks;
    ctx.emit({ type: 'damselPlaced', player: a.player, hex: a.hex });
    syncShelter(ctx);
    ctx.setPhase(ctx.state.phase.returnTo as never);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return damselHexes(ctx).map((hex) => ({ type: 'placeDamsel', player, hex }));
  },
};

/** Cities of C&K need to know which corners the Damsel shelters. */
export function syncShelter(ctx: Ctx): void {
  const want = cornersOf(ctx, hexOf(damselPiece(ctx)));
  const d = ckData(ctx);
  const now = d.sheltered ?? [];
  if (now.length !== want.length || now.some((c, i) => c !== want[i])) d.sheltered = want;
}

/** Can't build beside the Damsel. */
export function damselBlock(ctx: Ctx, a: Action): string | null {
  const corners = cornersOf(ctx, hexOf(damselPiece(ctx)));
  if (!corners.length) return null;
  if (typeof a.corner === 'string' && corners.includes(a.corner as CornerId))
    return 'Nobody can build beside the Damsel';
  if (typeof a.edge === 'string') {
    const ends = ctx.geometry.edgeCorners.get(a.edge as never) ?? [];
    if (ends.length && ends.every((c) => corners.includes(c)))
      return 'Nobody can build beside the Damsel';
  }
  return null;
}

// ---- The dragon ----

/** Hexes the dragon may go to on a 7: land, beside at least one knight. */
export function dragonHexes(ctx: Ctx): HexId[] {
  if (dragonGone(ctx)) return [];
  const here = hexOf(dragonPiece(ctx));
  return (Object.keys(ctx.state.hexes) as HexId[]).filter(
    (h) => h !== here && landHex(ctx, h) && cornersOf(ctx, h).some((c) => knightAt(ctx, c)),
  );
}

/** Puts the number back on a hex the dragon's lair took it from. */
function leaveLair(ctx: Ctx, dragon: Piece): void {
  if (!dragon.props.lair) return;
  const hex = ctx.state.hexes[hexOf(dragon) as HexId];
  if (hex && typeof dragon.props.token === 'number') hex.token = dragon.props.token;
  delete dragon.props.lair;
  delete dragon.props.token;
}

/** Moves (or places) the dragon: basic and strong knights beside it stand down. */
export function landDragon(ctx: Ctx, h: HexId, lair = false): void {
  let dragon = dragonPiece(ctx);
  if (dragon) leaveLair(ctx, dragon);
  const at = { kind: 'hex', id: h } as const;
  if (dragon) ctx.move(dragon, at);
  else dragon = ctx.place(DRAGON, null, at);
  if (lair) {
    const hex = ctx.state.hexes[h] as HexState;
    dragon.props.lair = true;
    if (hex.token !== undefined) dragon.props.token = hex.token;
    delete hex.token;
  }
  for (const c of cornersOf(ctx, h)) {
    const k = knightAt(ctx, c);
    if (k && isActive(k) && (k.type === 'knight1' || k.type === 'knight2')) {
      k.props.active = false;
      delete k.props.activatedTurn;
    }
  }
  if (hexOf(damselPiece(ctx)) === h) removeDamsel(ctx, 'dragon');
}

function liftDragon(ctx: Ctx): void {
  const dragon = dragonPiece(ctx);
  if (!dragon) return;
  leaveLair(ctx, dragon);
  ctx.remove(dragon);
}

/** On a 7 (after the first attack): move the dragon instead of the robber, or take it off. */
const moveDragon: ActionDef = {
  phases: ['moveRobber'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (ctx.state.phase.chased) return 'Your knight chased the robber: move the robber';
    if (dragonGone(ctx)) return 'The dragon was slain';
    if (a.hex === null) return dragonPiece(ctx) ? null : 'The dragon is not on the board';
    return dragonHexes(ctx).includes(a.hex as HexId)
      ? null
      : 'The dragon goes on a land hex beside a knight';
  },
  apply(ctx, a) {
    if (a.hex === null) liftDragon(ctx);
    else landDragon(ctx, a.hex as HexId);
    ctx.emit({ type: 'dragonMoved', player: a.player, hex: a.hex ?? null });
    ctx.setPhase({ id: ctx.state.phase.returnTo as string });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || ctx.state.phase.chased || dragonGone(ctx)) return [];
    const out: Action[] = dragonHexes(ctx).map((hex) => ({ type: 'moveDragon', player, hex }));
    if (dragonPiece(ctx)) out.push({ type: 'moveDragon', player, hex: null });
    return out;
  },
};

/** A strong knight beside the dragon chases it off; a mighty knight or hero slays it. */
const chaseDragon: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const dragon = dragonPiece(ctx);
    if (!dragon) return 'The dragon is not on the board';
    const k = ctx.state.pieces[a.knight as string];
    if (!k || !isKnight(k) || k.owner !== a.player) return 'That is not your knight';
    if (!canAct(ctx, k)) return 'Only an active knight that was not activated this turn can act';
    if (k.at.kind !== 'corner' || !cornersOf(ctx, hexOf(dragon)).includes(k.at.id))
      return 'The knight must stand next to the dragon';
    const need = dragon.props.lair ? 3 : 2;
    if (knightStrength(ctx, k) < need)
      return dragon.props.lair
        ? 'Only a mighty knight can drive the dragon from its lair'
        : 'Only a strong or mighty knight can face the dragon';
    return null;
  },
  apply(ctx, a) {
    const k = ctx.state.pieces[a.knight as string] as Piece;
    k.props.active = false;
    const slain = knightStrength(ctx, k) >= 3;
    liftDragon(ctx);
    if (slain) {
      dragonData(ctx).slayer = a.player;
      ctx.emit({ type: 'gwpDragonSlain', player: a.player });
    } else ctx.emit({ type: 'dragonChased', player: a.player });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !dragonPiece(ctx)) return [];
    return ctx
      .piecesOf(player)
      .filter(isKnight)
      .map((k) => ({ type: 'chaseDragon', player, knight: k.id }));
  },
};

/** The dragon's hex makes nothing, unless your Wizard stands there too. */
export function dragonBlocks(ctx: Ctx, hex: HexState, piece: Piece, value: boolean): boolean {
  if (value || hexOf(dragonPiece(ctx)) !== hex.id) return value;
  const wizard = ctx.piecesOfType('wizard')[0];
  return !(hexOf(wizard) === hex.id && wizard?.owner === piece.owner);
}

// ---- Lent ----

export function lentBlock(ctx: Ctx, a: Action): string | null {
  const l = dragonData(ctx).lent;
  if (!l || l.paid || l.target !== a.player || l.turn !== ctx.state.turn.number) return null;
  return 'Lent: pay 1 wool and 1 grain before you build this turn';
}

const payLent: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (!lentBlock(ctx, a)) return 'You are free to build';
    return ctx.has(a.player, { wool: 1, grain: 1 }) ? null : 'You need 1 wool and 1 grain';
  },
  apply(ctx, a) {
    ctx.pay(a.player, { wool: 1, grain: 1 });
    (dragonData(ctx).lent as NonNullable<DragonData['lent']>).paid = true;
    ctx.emit({ type: 'lentPaid', player: a.player });
  },
  enumerate: (ctx, player) => [{ type: 'payLent', player }],
};

/** The build actions Lent and the Damsel can stop. */
export const BUILD_ACTIONS = ['buildRoad', 'buildSettlement', 'buildCity'];
export const LENT_ONLY = ['buildKnight', 'buildWall'];
export const OPTIONAL_BUILDS = ['buildShip'];

export function guardBuild(damsel: boolean) {
  return (prev: ActionDef): ActionDef => ({
    ...prev,
    check: (ctx, a) =>
      lentBlock(ctx, a) ??
      festivalBlock(ctx, a) ??
      (damsel ? damselBlock(ctx, a) : null) ??
      prev.check(ctx, a),
  });
}

/** The robber doesn't steal on the Damsel's hex. */
export function wrapMoveRobber(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      if (hexOf(damselPiece(ctx)) !== a.hex) return prev.apply(ctx, a);
      const r = robber(ctx);
      if (r) ctx.move(r, { kind: 'hex', id: a.hex as HexId });
      ctx.emit({ type: 'robberMoved', player: a.player, hex: a.hex });
      ctx.setPhase({ id: ctx.state.phase.returnTo as string });
    },
  };
}

/** A knight that chased the robber has to move the robber, not the dragon. */
export function wrapChaseRobber(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      prev.apply(ctx, a);
      if (ctx.state.phase.id === 'moveRobber') ctx.setPhase({ ...ctx.state.phase, chased: true });
    },
  };
}

export const dragonActions: Record<string, ActionDef> = {
  placeDamsel,
  moveDragon,
  chaseDragon,
  payLent,
};

// ---- After every action ----

export function dragonAfter(ctx: Ctx): void {
  const d = dragonData(ctx);
  // Doubles: the roller places the Damsel once the roll is worked out.
  const prod = ctx.events.find((e) => e.type === 'production');
  if (prod) {
    const roll = (ctx.state.data.base as { lastRoll?: { dice: Record<string, unknown> } })
      ?.lastRoll;
    const dice = roll?.dice ?? {};
    const red = dice.red ?? dice.white1;
    const yellow = dice.yellow ?? dice.white2;
    if (typeof red === 'number' && red === yellow) d.damselDue = ctx.active;
  }
  if (
    typeof d.damselDue === 'number' &&
    ctx.state.phase.id === 'main' &&
    ctx.active === d.damselDue &&
    ctx.state.winner === null
  ) {
    d.damselDue = null;
    if (damselHexes(ctx).length)
      ctx.setPhase({ id: 'placeDamsel', returnTo: { id: 'main' } } as never);
  }
  // She leaves after an attack (once any lost cities are picked), or when a neutral piece lands on her.
  const damsel = damselPiece(ctx);
  if (damsel) {
    const h = hexOf(damsel);
    const attacked = ckData(ctx).attacks > ((damsel.props.attacks as number | undefined) ?? 0);
    if (attacked && ctx.state.phase.id !== 'loseCity') removeDamsel(ctx, 'attack');
    else if (
      ctx.events.some(
        (e) => (e.type === 'neutralPlaced' || e.type === 'merchantPlaced') && e.hex === h,
      )
    )
      removeDamsel(ctx, 'neutral');
  }
  // The Wizard chases the dragon off its hex (not from its lair).
  const dragon = dragonPiece(ctx);
  if (
    dragon &&
    !dragon.props.lair &&
    ctx.events.some(
      (e) => e.type === 'neutralPlaced' && e.piece === 'wizard' && e.hex === hexOf(dragon),
    )
  ) {
    liftDragon(ctx);
    ctx.emit({ type: 'dragonChased', player: ctx.active, by: 'wizard' });
  }
  syncShelter(ctx);
}

export function lentTurnStarted(ctx: Ctx): void {
  const l = dragonData(ctx).lent;
  if (l && l.turn === null && l.target === ctx.active) l.turn = ctx.state.turn.number;
}

export function lentTurnEnded(ctx: Ctx): void {
  const d = dragonData(ctx);
  if (d.lent && d.lent.turn === ctx.state.turn.number) d.lent = null;
}

/** Dragon Slayer: 2 points, kept for good. */
export function slayerVp(ctx: Ctx, seat: number): number {
  return dragonData(ctx).slayer === seat ? 2 : 0;
}
