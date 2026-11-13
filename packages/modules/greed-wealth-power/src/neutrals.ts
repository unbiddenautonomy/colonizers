import type {
  Action,
  ActionDef,
  CornerId,
  Ctx,
  HexId,
  HexState,
  Phase,
  Piece,
} from '@colonizers/engine';
import { robber } from '@colonizers/module-base';
import {
  ckData,
  holdsProgress,
  isKnight,
  knightStrength,
  spendProgress,
  TERRAIN_COMMODITY,
} from '@colonizers/module-cities-knights';
import {
  HERO_CARDS,
  MODULE_ID,
  NEUTRALS,
  RIVAL_NEUTRALS,
  type Building,
  type Neutral,
} from './constants.ts';

/**
 * Greed, Wealth & Power's neutral pieces. Each is placed by its progress card;
 * playing the card when the piece is already out takes it over and moves it.
 * Whoever controls a piece scores 1 VP for it.
 *
 * - **Duke** (Politics), on any land hex: your knights on its corners are 1
 *   stronger, everyone else's 1 weaker (down to 0). A mighty knight beside your
 *   Duke is a hero (strength 4) and wins you a Hero of Catan card, kept for good.
 * - **Scholar** (Science), beside your own city: 1 extra card when its hex produces.
 * - **Wizard** (Magic), beside your settlement or city: the robber does not stop
 *   your production on its hex.
 * - **Inquisitor** (Religion), beside another player's settlement or city (not
 *   one with a Citadel): that player loses every level 3 ability.
 * - **Envoy** (Wealth), beside another player's city: 1 card when its hex produces.
 *
 * The Scholar, Wizard and Inquisitor chase each other off a hex they share.
 */

const NAMES: Record<Neutral, string> = {
  duke: 'Duke',
  scholar: 'Scholar',
  wizard: 'Wizard',
  inquisitor: 'Inquisitor',
  envoy: 'Envoy',
};

export function isNeutral(card: unknown): card is Neutral {
  return typeof card === 'string' && (NEUTRALS as readonly string[]).includes(card);
}

export function neutralPiece(ctx: Ctx, type: Neutral): Piece | undefined {
  return ctx.piecesOfType(type)[0];
}

function hexOf(p: Piece | undefined): HexId | null {
  return p?.at.kind === 'hex' ? p.at.id : null;
}

interface HeroData extends Record<string, unknown> {
  heroes?: number[];
}

/** Seats holding a Hero of Catan card. */
export function heroes(ctx: Ctx): number[] {
  return (ctx.data<HeroData>(MODULE_ID).heroes ??= []);
}

function landHex(ctx: Ctx, h: HexId, producing: boolean): boolean {
  const hex = ctx.state.hexes[h];
  if (!hex || hex.hidden) return false;
  const def = ctx.registry.hexTypes[hex.type];
  if (!def || def.terrain !== 'land') return false;
  return !producing || !!def.produces || hex.type === 'gold';
}

/** Buildings (settlements and cities) on a hex's corners. */
function buildingsOn(ctx: Ctx, h: HexId): Piece[] {
  const out: Piece[] = [];
  for (const c of ctx.geometry.hexCorners.get(h) ?? []) {
    const b = ctx.buildingAt(c);
    if (b && b.owner !== null) out.push(b);
  }
  return out;
}

const isCity = (p: Piece) => p.type === 'city';

function citadelCorners(ctx: Ctx): Set<CornerId> {
  const d = ctx.state.data[MODULE_ID] as
    { buildings?: Record<number, Partial<Record<Building, { corner: CornerId }>>> } | undefined;
  const out = new Set<CornerId>();
  for (const mine of Object.values(d?.buildings ?? {}))
    if (mine.citadel) out.add(mine.citadel.corner);
  return out;
}

/** Hexes where a player may put a neutral piece. The Inquisitor needs its target. */
export function neutralHexes(ctx: Ctx, seat: number, type: Neutral, target?: number): HexId[] {
  const all = Object.keys(ctx.state.hexes) as HexId[];
  switch (type) {
    case 'duke':
      return all.filter((h) => landHex(ctx, h, false));
    case 'scholar':
      return all.filter(
        (h) =>
          landHex(ctx, h, true) && buildingsOn(ctx, h).some((b) => b.owner === seat && isCity(b)),
      );
    case 'wizard':
      return all.filter(
        (h) => landHex(ctx, h, true) && buildingsOn(ctx, h).some((b) => b.owner === seat),
      );
    case 'inquisitor': {
      if (target === undefined || target === seat) return [];
      const citadels = citadelCorners(ctx);
      return all.filter((h) => {
        if (!landHex(ctx, h, false)) return false;
        const here = buildingsOn(ctx, h);
        if (!here.some((b) => b.owner === target)) return false;
        return !here.some((b) => isCity(b) && b.at.kind === 'corner' && citadels.has(b.at.id));
      });
    }
    case 'envoy':
      return all.filter(
        (h) =>
          landHex(ctx, h, true) && buildingsOn(ctx, h).some((b) => b.owner !== seat && isCity(b)),
      );
  }
}

/** Players the Inquisitor can be set against. */
function inquisitorTargets(ctx: Ctx, seat: number): number[] {
  return ctx.state.players
    .map((p) => p.seat)
    .filter((s) => s !== seat && neutralHexes(ctx, seat, 'inquisitor', s).length > 0);
}

/** Keeps Cities & Knights' list of players without abilities in step with the Inquisitor. */
export function syncInquisitor(ctx: Ctx): void {
  const inq = neutralPiece(ctx, 'inquisitor');
  const target = inq?.props.target;
  const want = inq && typeof target === 'number' ? [target] : [];
  const d = ckData(ctx);
  const now = d.noAbilities ?? [];
  if (now.length !== want.length || now.some((s, i) => s !== want[i])) d.noAbilities = want;
}

// ---- Playing the cards ----

interface Play {
  card: string;
  target?: number;
}

function checkNeutral(ctx: Ctx, a: Action & Play): string | null {
  if (a.player !== ctx.active) return 'Not your turn';
  if (ctx.state.phase.id !== 'main') return 'Progress cards are played after rolling';
  if (!holdsProgress(ctx, a.player, a.card)) return 'You do not hold that card';
  const type = a.card as Neutral;
  if (type === 'inquisitor') {
    const t = a.target;
    if (!Number.isInteger(t) || t === a.player || !ctx.state.players[t as number])
      return 'Pick another player';
    if (!neutralHexes(ctx, a.player, type, t).length)
      return 'There is no hex for the Inquisitor beside that player';
    return null;
  }
  return neutralHexes(ctx, a.player, type).length ? null : `There is no hex for the ${NAMES[type]}`;
}

/** Playing a neutral piece's card asks for its hex next. */
export function wrapPlayProgress(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      return isNeutral(a.card) ? checkNeutral(ctx, a as Action & Play) : prev.check(ctx, a);
    },
    apply(ctx, a) {
      if (!isNeutral(a.card)) return prev.apply(ctx, a);
      spendProgress(ctx, a.player, a.card);
      const ph: Phase = { id: 'placeNeutral', piece: a.card, returnTo: ctx.state.phase };
      if (a.card === 'inquisitor') ph.target = a.target as number;
      ctx.setPhase(ph);
    },
    enumerate(ctx, player) {
      const out = (prev.enumerate?.(ctx, player) ?? []).filter((a) => !isNeutral(a.card));
      if (player !== ctx.active || ctx.state.phase.id !== 'main') return out;
      for (const card of NEUTRALS) {
        if (!holdsProgress(ctx, player, card)) continue;
        if (card === 'inquisitor')
          for (const target of inquisitorTargets(ctx, player))
            out.push({ type: 'playProgress', player, card, target });
        else out.push({ type: 'playProgress', player, card });
      }
      return out;
    },
  };
}

const placeNeutral: ActionDef = {
  phases: ['placeNeutral'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const ph = ctx.state.phase;
    const type = ph.piece as Neutral;
    const ok = neutralHexes(ctx, a.player, type, ph.target as number | undefined);
    return ok.includes(a.hex as HexId) ? null : `The ${NAMES[type]} can not go there`;
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const type = ph.piece as Neutral;
    const hex = a.hex as HexId;
    const at = { kind: 'hex', id: hex } as const;
    let p = neutralPiece(ctx, type);
    const from = p?.owner ?? null;
    if (p) {
      p.owner = a.player;
      ctx.move(p, at);
    } else p = ctx.place(type, a.player, at);
    if (type === 'inquisitor') p.props.target = ph.target;
    ctx.emit({ type: 'neutralPlaced', player: a.player, piece: type, hex, from });
    // The Scholar, Wizard and Inquisitor chase each other away.
    if (RIVAL_NEUTRALS.includes(type))
      for (const other of RIVAL_NEUTRALS) {
        const q = other === type ? undefined : neutralPiece(ctx, other);
        if (!q || hexOf(q) !== hex) continue;
        ctx.remove(q);
        ctx.emit({ type: 'neutralChased', player: q.owner, piece: other, by: type, hex });
      }
    syncInquisitor(ctx);
    ctx.setPhase(ph.returnTo as Phase);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const ph = ctx.state.phase;
    return neutralHexes(ctx, player, ph.piece as Neutral, ph.target as number | undefined).map(
      (hex) => ({ type: 'placeNeutral', player, hex }),
    );
  },
};

export const neutralActions: Record<string, ActionDef> = { placeNeutral };

// ---- Effects ----

/** The Duke: +1 for its controller's knights on its corners, -1 for everyone else's. */
export function dukeStrength(ctx: Ctx, k: Piece, value: number): number {
  const h = hexOf(neutralPiece(ctx, 'duke'));
  if (!h || k.at.kind !== 'corner') return value;
  if (!(ctx.geometry.hexCorners.get(h) ?? []).includes(k.at.id)) return value;
  return k.owner === neutralPiece(ctx, 'duke')?.owner ? value + 1 : value - 1;
}

/** The Wizard: the robber doesn't stop its controller's production on its hex. */
export function wizardUnblocks(ctx: Ctx, hex: HexState, piece: Piece, value: boolean): boolean {
  if (!value) return value;
  const w = neutralPiece(ctx, 'wizard');
  return hexOf(w) === hex.id && w?.owner === piece.owner && robberOn(ctx, hex.id) ? false : value;
}

function robberOn(ctx: Ctx, h: HexId): boolean {
  return hexOf(robber(ctx)) === h;
}

/** The extra card a hex gives the Scholar or Envoy: its commodity when it has one the player may take. */
export function bonusCard(ctx: Ctx, seat: number, hex: HexState): string | null {
  const produces = ctx.registry.hexTypes[hex.type]?.produces;
  const d = ctx.state.data[MODULE_ID] as
    { buildings?: Record<number, Partial<Record<Building, unknown>>> } | undefined;
  const mine = d?.buildings?.[seat] ?? {};
  let commodity: string | undefined = TERRAIN_COMMODITY[hex.type];
  if (produces === 'brick' && mine.citadel) commodity = 'crystal';
  if (produces === 'grain' && mine.diocese) commodity = 'bread';
  if (hex.type === 'gold' && mine.monument) commodity = 'gold';
  if (commodity && ctx.bankHas({ [commodity]: 1 })) return commodity;
  if (produces && ctx.bankHas({ [produces]: 1 })) return produces;
  return null;
}

/** Scholar and Envoy: one card each when their hex produces. Returns the seats paid. */
export function neutralYield(ctx: Ctx): number[] {
  const prod = ctx.events.find((e) => e.type === 'production');
  if (!prod) return [];
  const paid: number[] = [];
  for (const type of ['scholar', 'envoy'] as const) {
    const p = neutralPiece(ctx, type);
    const h = hexOf(p);
    if (!p || !h || p.owner === null) continue;
    const hex = ctx.state.hexes[h];
    if (!hex || hex.hidden || hex.token !== prod.total) continue;
    const cities = buildingsOn(ctx, h).filter(isCity);
    const owner = p.owner;
    const fits =
      type === 'scholar'
        ? cities.some((c) => c.owner === owner)
        : cities.some((c) => c.owner !== owner);
    if (!fits) continue;
    if (ctx.reduce('hexBlocked', hex, p, robberOn(ctx, h))) continue;
    const card = bonusCard(ctx, owner, hex);
    if (!card) continue;
    ctx.grant(owner, { [card]: 1 });
    paid.push(owner);
    ctx.emit({ type: 'neutralYield', player: owner, piece: type, got: { [card]: 1 } });
  }
  return paid;
}

/** Hero of Catan: the first time a player has a knight at strength 4. */
export function crownHeroes(ctx: Ctx): void {
  const list = heroes(ctx);
  if (list.length >= HERO_CARDS || !neutralPiece(ctx, 'duke')) return;
  for (const p of ctx.state.players) {
    if (list.includes(p.seat) || list.length >= HERO_CARDS) continue;
    const hero = ctx.piecesOf(p.seat).some((k) => isKnight(k) && knightStrength(ctx, k) >= 4);
    if (!hero) continue;
    list.push(p.seat);
    ctx.emit({ type: 'heroOfCatan', player: p.seat });
  }
}

/** 1 VP for each neutral piece controlled, and 1 for a Hero of Catan card. */
export function neutralVp(ctx: Ctx, seat: number): number {
  let v = heroes(ctx).includes(seat) ? 1 : 0;
  for (const t of NEUTRALS) if (neutralPiece(ctx, t)?.owner === seat) v += 1;
  return v;
}

export { NAMES as NEUTRAL_NAMES };
