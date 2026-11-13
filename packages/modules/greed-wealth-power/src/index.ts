import type {
  Action,
  ActionDef,
  Cards,
  CornerId,
  Ctx,
  GameModule,
  HexId,
  Phase,
  Piece,
} from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { commoditiesIn, hasAbility, isActive, isKnight } from '@colonizers/module-cities-knights';
import {
  BEER,
  BUILDING_COMMODITY,
  BUILDING_HEX,
  BUILDINGS,
  commodityBank,
  GWP_COMMODITIES,
  MODULE_ID,
  NEUTRAL_CARDS,
  NEUTRALS,
  SETTINGS,
  type Building,
} from './constants.ts';
import {
  crownHeroes,
  dukeStrength,
  neutralActions,
  neutralVp,
  neutralYield,
  syncInquisitor,
  wizardUnblocks,
  wrapPlayProgress,
} from './neutrals.ts';

/**
 * Greed, Wealth & Power (lightningserpent's fan expansion for Cities & Knights),
 * so far: the Magic, Religion and Wealth tracks with their commodities and
 * metropolises, the 12-sided event die, the four special buildings, Beer, and
 * the five neutral pieces with Hero of Catan (see neutrals.ts).
 *
 * - **Citadel** (brick hex), **Diocese** (grain hex) and **Monument** (gold
 *   field) beside one of your cities let all your cities on that terrain make
 *   Crystal, Bread or Gold. A **Silo** (grain hex) adds a grain to each of your
 *   cities on grain. One of each per player; a city loses its buildings when
 *   the barbarians knock it back to a settlement.
 * - Level 3: Magic trades brick 1:1 for any resource, Wealth trades any
 *   resource 2:1 for another, and Religion brews 1 Beer on a roll (not a 7)
 *   that gives you nothing.
 * - Beer is a public token: 1 activates any knight, and it trades with the bank
 *   only for commodities (4:1, 3:1 with a 3:1 harbor, 2:1 with Trade level 3).
 *
 * List it after Cities & Knights and Seafarers, so its production changes come last.
 */

export * from './constants.ts';
export {
  bonusCard,
  heroes,
  isNeutral,
  NEUTRAL_NAMES,
  neutralHexes,
  neutralPiece,
} from './neutrals.ts';

interface Placed {
  corner: CornerId;
  hex: HexId;
}

export interface GwpData extends Record<string, unknown> {
  beer: Record<number, number>;
  buildings: Record<number, Partial<Record<Building, Placed>>>;
}

export function gwpData(ctx: Ctx): GwpData {
  const d = ctx.data<GwpData>(MODULE_ID);
  d.beer ??= {};
  d.buildings ??= {};
  return d;
}

export function beerOf(ctx: Ctx, seat: number): number {
  return gwpData(ctx).beer[seat] ?? 0;
}

export function addBeer(ctx: Ctx, seat: number, n: number): void {
  const d = gwpData(ctx);
  d.beer[seat] = Math.max(0, (d.beer[seat] ?? 0) + n);
}

export function buildingsOf(ctx: Ctx, seat: number): Partial<Record<Building, Placed>> {
  return (gwpData(ctx).buildings[seat] ??= {});
}

type A<T> = Action & T;
function action<T>(def: ActionDef<A<T>>): ActionDef {
  return def as unknown as ActionDef;
}

const onlyActive = (ctx: Ctx, a: Action): string | null =>
  a.player === ctx.active ? null : 'Not your turn';

const isResource = (c: string) => (RESOURCES as readonly string[]).includes(c);

const NAMES: Record<Building, string> = {
  citadel: 'Citadel',
  diocese: 'Diocese',
  monument: 'Monument',
  silo: 'Silo',
};

// ---- Buildings ----

/** Does this hex take this building? */
export function hexFits(ctx: Ctx, building: Building, hex: HexId): boolean {
  const h = ctx.state.hexes[hex];
  if (!h || h.hidden) return false;
  if (building === 'monument') return h.type === 'gold';
  return ctx.registry.hexTypes[h.type]?.produces === BUILDING_HEX[building];
}

/** What it costs to put this building beside the piece at a corner. */
export function buildingCost(ctx: Ctx, seat: number, building: Building, corner: CornerId): Cards {
  const b = ctx.buildingAt(corner);
  if (building === 'citadel' && b?.type === 'settlement')
    return ctx.cost('citadelSettlement', seat);
  return ctx.cost(building, seat);
}

export function buildBlock(
  ctx: Ctx,
  seat: number,
  building: Building,
  corner: CornerId,
  hex: HexId,
): string | null {
  if (!(BUILDINGS as readonly string[]).includes(building)) return 'Pick a building';
  const name = NAMES[building];
  const mine = buildingsOf(ctx, seat);
  if (mine[building]) return `You have already built your ${name}`;
  const b = ctx.buildingAt(corner);
  const asSettlement = building === 'citadel' && b?.type === 'settlement';
  if (!b || b.owner !== seat || (b.type !== 'city' && !asSettlement))
    return `A ${name} goes beside one of your cities`;
  if (asSettlement && ctx.supplyLeft(seat, 'city') <= 0) return 'No cities left';
  if (!(ctx.geometry.cornerHexes.get(corner) ?? []).includes(hex))
    return `The ${name} goes on a hex touching that city`;
  if (!hexFits(ctx, building, hex)) {
    const where = {
      citadel: 'a brick hex',
      diocese: 'a grain hex',
      monument: 'a gold field',
      silo: 'a grain hex',
    };
    return `A ${name} goes on ${where[building]}`;
  }
  const here = Object.entries(mine).filter(([, p]) => p?.corner === corner);
  if (here.some(([, p]) => p?.hex === hex)) return 'That city already has a building on that hex';
  if (building === 'citadel' && mine.diocese?.corner === corner)
    return 'A city with a Diocese can not have a Citadel';
  if (building === 'diocese' && mine.citadel?.corner === corner)
    return 'A city with a Citadel can not have a Diocese';
  if (!ctx.has(seat, buildingCost(ctx, seat, building, corner)))
    return `You can not afford a ${name}`;
  return null;
}

const buildGwp = action<{ building: Building; corner: CornerId; hex: HexId }>({
  phases: ['main'],
  check(ctx, a) {
    return onlyActive(ctx, a) ?? buildBlock(ctx, a.player, a.building, a.corner, a.hex);
  },
  apply(ctx, a) {
    ctx.pay(a.player, buildingCost(ctx, a.player, a.building, a.corner));
    const b = ctx.buildingAt(a.corner) as Piece;
    if (b.type === 'settlement') {
      ctx.upgrade(b, 'city');
      ctx.emit({ type: 'built', player: a.player, piece: 'city', at: a.corner });
    }
    buildingsOf(ctx, a.player)[a.building] = { corner: a.corner, hex: a.hex };
    ctx.emit({
      type: 'gwpBuilt',
      player: a.player,
      building: a.building,
      at: a.corner,
      hex: a.hex,
    });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    const mine = buildingsOf(ctx, player);
    for (const p of ctx.piecesOf(player)) {
      if (p.at.kind !== 'corner' || (p.type !== 'city' && p.type !== 'settlement')) continue;
      for (const hex of ctx.geometry.cornerHexes.get(p.at.id) ?? [])
        for (const building of BUILDINGS) {
          if (mine[building] || (p.type === 'settlement' && building !== 'citadel')) continue;
          if (!hexFits(ctx, building, hex)) continue;
          out.push({ type: 'buildGwp', player, building, corner: p.at.id, hex });
        }
    }
    return out;
  },
});

/** Buildings whose city was knocked back to a settlement (or lost) come off the board. */
function dropLostBuildings(ctx: Ctx): void {
  const d = gwpData(ctx);
  for (const [seatKey, mine] of Object.entries(d.buildings)) {
    const seat = Number(seatKey);
    for (const building of BUILDINGS) {
      const at = mine[building];
      if (!at) continue;
      const b = ctx.buildingAt(at.corner);
      if (b && b.owner === seat && b.type === 'city') continue;
      delete mine[building];
      ctx.emit({ type: 'gwpLost', player: seat, building, at: at.corner });
    }
  }
}

// ---- Beer ----

/** Beer the bank wants for one commodity. */
export function beerRatio(ctx: Ctx, seat: number): number {
  let ratio = Math.min(4, ctx.reduce('tradeRatio', seat, BEER, 4));
  if (hasAbility(ctx, seat, 'trade')) ratio = Math.min(ratio, 2);
  return ratio;
}

const beerTrade = action<{ get: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!commoditiesIn(ctx).includes(a.get)) return 'Beer only buys commodities';
    const ratio = beerRatio(ctx, a.player);
    if (beerOf(ctx, a.player) < ratio) return `You need ${ratio} Beer`;
    if (!ctx.bankHas({ [a.get]: 1 })) return 'The bank has none left';
    return null;
  },
  apply(ctx, a) {
    const ratio = beerRatio(ctx, a.player);
    addBeer(ctx, a.player, -ratio);
    ctx.grant(a.player, { [a.get]: 1 });
    ctx.emit({ type: 'beerTrade', player: a.player, beer: ratio, got: { [a.get]: 1 } });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return commoditiesIn(ctx).map((get) => ({ type: 'beerTrade', player, get }));
  },
});

/** One Beer switches on any knight, yours or someone else's. */
const beerKnight = action<{ knight: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const k = typeof a.knight === 'string' ? ctx.state.pieces[a.knight] : undefined;
    if (!k || !isKnight(k)) return 'Pick a knight';
    if (isActive(k)) return 'That knight is already active';
    if (beerOf(ctx, a.player) < 1) return 'You need 1 Beer';
    return null;
  },
  apply(ctx, a) {
    const k = ctx.state.pieces[a.knight] as Piece;
    addBeer(ctx, a.player, -1);
    k.props.active = true;
    k.props.activatedTurn = ctx.state.turn.number;
    ctx.emit({
      type: 'beerKnight',
      player: a.player,
      owner: k.owner,
      at: (k.at as { id: CornerId }).id,
    });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || beerOf(ctx, player) < 1) return [];
    return Object.values(ctx.state.pieces)
      .filter((p) => isKnight(p) && !isActive(p))
      .map((k) => ({ type: 'beerKnight', player, knight: k.id }));
  },
});

/** Seats a phase (or a phase it returns to) is still waiting on. */
function owedIn(phase: Phase | undefined, seat: number): boolean {
  for (let p = phase; p; p = p.returnTo as Phase | undefined) {
    const owed = p.owed as Record<number, number> | undefined;
    if (owed?.[seat]) return true;
  }
  return false;
}

/** Religion level 3: a roll (not a 7) that brings you nothing brews 1 Beer. */
function brewBeer(ctx: Ctx, alsoPaid: number[]): void {
  const prod = ctx.events.find((e) => e.type === 'production');
  if (!prod || prod.total === 7) return;
  const received = (prod.received ?? {}) as Record<number, Cards>;
  const brewed: number[] = [];
  for (const p of ctx.state.players) {
    if (!hasAbility(ctx, p.seat, 'religion')) continue;
    if (Object.values(received[p.seat] ?? {}).some((n) => n > 0)) continue;
    if (alsoPaid.includes(p.seat)) continue;
    // Gold to pick, or an Aqueduct pick (where Beer is one of the choices), comes first.
    if (owedIn(ctx.state.phase, p.seat)) continue;
    addBeer(ctx, p.seat, 1);
    brewed.push(p.seat);
  }
  if (brewed.length) ctx.emit({ type: 'beerBrewed', players: brewed });
}

// ---- The module ----

const commodity = { category: 'commodity', countsForHandLimit: true, bank: commodityBank };

export const greedWealthPowerModule: GameModule = {
  id: MODULE_ID,
  name: 'Greed, Wealth & Power',
  requires: ['cities-knights'],
  settings: SETTINGS,
  cardTypes: Object.fromEntries(GWP_COMMODITIES.map((c) => [c, commodity])),
  decks: {
    magic: { cards: () => ({ wizard: NEUTRAL_CARDS.wizard }) },
    religion: { cards: () => ({ inquisitor: NEUTRAL_CARDS.inquisitor }) },
    wealth: { cards: () => ({ envoy: NEUTRAL_CARDS.envoy }) },
  },
  pieceTypes: Object.fromEntries(NEUTRALS.map((n) => [n, { on: 'hex' as const }])),
  costs: {
    citadel: { ore: 1, brick: 2 },
    citadelSettlement: { ore: 3, grain: 2, brick: 2 },
    diocese: { brick: 1, lumber: 1, grain: 1 },
    monument: { ore: 1, brick: 1 },
    silo: { brick: 1, lumber: 1 },
  },
  actions: { buildGwp, beerTrade, beerKnight, ...neutralActions },
  wrapActions: {
    playProgress: wrapPlayProgress,
    // Science and Religion level 3 together: the Aqueduct pick can be a Beer instead.
    aqueductPick: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        if (a.card !== BEER) return prev.check(ctx, a);
        const owed = ctx.state.phase.owed as Record<number, number> | undefined;
        if (!owed?.[a.player]) return 'You have nothing to pick';
        return hasAbility(ctx, a.player, 'religion') ? null : 'Beer needs Religion level 3';
      },
      apply(ctx, a) {
        if (a.card !== BEER) return prev.apply(ctx, a);
        addBeer(ctx, a.player, 1);
        ctx.emit({ type: 'beerBrewed', players: [a.player] });
        const ph = ctx.state.phase;
        const owed = { ...(ph.owed as Record<number, number>) };
        delete owed[a.player];
        if (Object.keys(owed).length) ctx.setPhase({ ...ph, owed });
        else ctx.setPhase(ph.returnTo as Phase);
      },
      enumerate(ctx, player) {
        const out = prev.enumerate?.(ctx, player) ?? [];
        if (!out.length || !hasAbility(ctx, player, 'religion')) return out;
        return [...out, { type: 'aqueductPick', player, card: BEER }];
      },
    }),
  },
  hooks: {
    init(ctx) {
      gwpData(ctx);
      // The Duke and Scholar join the Cities & Knights decks.
      for (const [deck, card] of [
        ['politics', 'duke'],
        ['science', 'scholar'],
      ] as const) {
        const cards = ctx.state.decks[deck];
        if (!cards) continue;
        ctx.state.decks[deck] = ctx.rng.shuffle([
          ...cards,
          ...Array<string>(NEUTRAL_CARDS[card]).fill(card),
        ]);
      }
    },
    afterAction(ctx) {
      dropLostBuildings(ctx);
      const paid = neutralYield(ctx);
      brewBeer(ctx, paid);
      syncInquisitor(ctx);
      crownHeroes(ctx);
    },
  },
  reducers: {
    knightStrength: dukeStrength,
    hexBlocked: wizardUnblocks,
    vp(ctx, seat, value) {
      return value + neutralVp(ctx, seat);
    },
    hexYield(ctx, hex, piece, value) {
      if (piece.type !== 'city' || piece.owner === null) return value;
      const mine = buildingsOf(ctx, piece.owner);
      const produces = ctx.registry.hexTypes[hex.type]?.produces;
      const v: Cards = { ...value };
      const swap = (from: string, to: string) => {
        if ((v[from] ?? 0) <= 0) return;
        v[from] = (v[from] ?? 0) - 1;
        v[to] = (v[to] ?? 0) + 1;
      };
      if (produces === 'brick' && mine.citadel) swap('brick', 'crystal');
      if (produces === 'grain') {
        if (mine.diocese) swap('grain', 'bread');
        if (mine.silo) v.grain = (v.grain ?? 0) + 1;
      }
      if (hex.type === 'gold' && mine.monument) {
        // One of the city's two gold-field picks becomes a Gold commodity.
        const sea = ctx.state.data.seafarers as
          { pendingGold?: Record<number, number> } | undefined;
        const left = sea?.pendingGold?.[piece.owner] ?? 0;
        if (sea?.pendingGold && left > 0) {
          sea.pendingGold[piece.owner] = left - 1;
          v.gold = (v.gold ?? 0) + 1;
        }
      }
      for (const k of Object.keys(v)) if (!v[k]) delete v[k];
      return v;
    },
    swapRatio(ctx, seat, give, get, value) {
      if (!isResource(give) || !isResource(get)) return value;
      let best = value;
      // Magic Kitchen: brick for any other resource, 1:1.
      if (give === 'brick' && hasAbility(ctx, seat, 'magic')) best = Math.min(best, 1);
      // Marketplace: any resource for another, 2:1.
      if (hasAbility(ctx, seat, 'wealth')) best = Math.min(best, 2);
      return best;
    },
  },
};

/** The commodity a building unlocks, for the UI. */
export function buildingCommodity(building: Building): string | undefined {
  return BUILDING_COMMODITY[building];
}
