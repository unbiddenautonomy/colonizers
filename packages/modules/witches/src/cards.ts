import type { ActionDef, Cards, CornerId, Ctx, HexId, Phase, Piece } from '@colonizers/engine';
import { RESOURCES, routesAt } from '@colonizers/module-base';
import {
  activeTracks,
  attackHeld,
  barbarianTrack,
  citiesOf,
  ckData,
  defineFanCards,
  eventFaces,
  fanDeck,
  keepOne,
  knightsOf,
  landBarbarians,
  levels,
  lowerTrack,
  MAX_LEVEL,
  others,
  pickTarget,
  progressCount,
  progressHeld,
  raiseTrack,
  rivalMetropolis,
  seatAllows,
  takeHeld,
  targets,
  type FanCard,
  type FanPlay as Play,
  type Pooled,
  type Track,
} from '@colonizers/module-cities-knights';
import { MAGIC_TRACKS, SMALL_DRAGON_EXTRA } from './constants.ts';
import {
  placeWizard,
  spellOn,
  witchesData,
  witchesView,
  wizardPiece,
  wizardSpots,
} from './rules.ts';

/**
 * The Magic deck: eighteen cards. Each is a row in CARDS: when it can be
 * played, the choices it offers, and what it does. Cards that pick spots on
 * the board (Lightning, Star Favor, Enchanted Land, the Wizard, Magic Move)
 * open a `magicPick` step.
 */

const MAIN: Phase = { id: 'main' };
const back = (ctx: Ctx) => ctx.setPhase(ctx.state.phase.returnTo as Phase);

/** Cards that pick on the board, one or two spots. */
export const PICK_CARDS = ['lightning', 'starFavor', 'enchantedLand', 'wizard', 'magicMove'];

const pick = (card: string) => (ctx: Ctx, a: Play) =>
  ctx.setPhase({ id: 'magicPick', card, by: a.player, returnTo: MAIN });

// ---- Board spots ----

const visibleHexes = (ctx: Ctx) => Object.values(ctx.state.hexes).filter((h) => !h.hidden);

/** Land that yields something: what Lightning can strike. */
function fertile(ctx: Ctx): HexId[] {
  return visibleHexes(ctx)
    .filter((h) => {
      const def = ctx.registry.hexTypes[h.type];
      return def?.terrain === 'land' && !!def.produces;
    })
    .map((h) => h.id);
}

/** Hexes with a number: Star Favor swaps any two. */
const numbered = (ctx: Ctx): HexId[] =>
  visibleHexes(ctx)
    .filter((h) => h.token !== undefined)
    .map((h) => h.id);

/** Land hexes: Enchanted Land swaps any two, numbers and all. */
const landHexes = (ctx: Ctx): HexId[] =>
  visibleHexes(ctx)
    .filter((h) => ctx.registry.hexTypes[h.type]?.terrain === 'land')
    .map((h) => h.id);

/** Where Magic Move can put a building from `from`: a legal settlement spot on your routes. */
function moveTargets(ctx: Ctx, seat: number, from: CornerId): CornerId[] {
  return ctx.geometry.corners.filter((c) => {
    if (c === from || !ctx.isLandCorner(c)) return false;
    if (ctx.piecesAt({ kind: 'corner', id: c }).length) return false;
    const near = ctx.geometry.cornerNeighbours.get(c) ?? [];
    if (near.some((n) => n !== from && ctx.buildingAt(n))) return false;
    return routesAt(ctx, seat, c).length > 0;
  });
}

const movable = (ctx: Ctx, seat: number): Piece[] =>
  ctx
    .piecesOf(seat)
    .filter(
      (p) =>
        (p.type === 'settlement' || p.type === 'city') &&
        p.at.kind === 'corner' &&
        moveTargets(ctx, seat, p.at.id).length > 0,
    );

/** The spots a `magicPick` step offers now. */
export function pickSpots(ctx: Ctx): { hexes: HexId[]; corners: CornerId[] } {
  const ph = ctx.state.phase;
  const seat = ph.by as number;
  const first = ph.first as string | undefined;
  const none = { hexes: [] as HexId[], corners: [] as CornerId[] };
  switch (ph.card) {
    case 'lightning':
      return { ...none, hexes: fertile(ctx) };
    case 'starFavor':
      return { ...none, hexes: numbered(ctx).filter((h) => h !== first) };
    case 'enchantedLand':
      return { ...none, hexes: landHexes(ctx).filter((h) => h !== first) };
    case 'wizard':
      return { ...none, corners: wizardSpots(ctx, seat) };
    case 'magicMove':
      return {
        ...none,
        corners: first
          ? moveTargets(ctx, seat, first as CornerId)
          : movable(ctx, seat).map((p) => (p.at as { id: CornerId }).id),
      };
    default:
      return none;
  }
}

// ---- Card helpers ----

/** Every way to name three resources (repeats allowed). */
function threeOf(cards: readonly string[]): Cards[] {
  const out: Cards[] = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i; j < cards.length; j++)
      for (let k = j; k < cards.length; k++) {
        const c: Cards = {};
        for (const x of [cards[i]!, cards[j]!, cards[k]!]) c[x] = (c[x] ?? 0) + 1;
        out.push(c);
      }
  return out;
}

/** Two of a settlement's cards, for Magic Fortune. */
function twoOf(ctx: Ctx, seat: number): Cards[] {
  const cost = ctx.cost('settlement', seat);
  const cards = Object.entries(cost).flatMap(([c, n]) => Array<string>(n).fill(c));
  const seen = new Set<string>();
  const out: Cards[] = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) {
      const c: Cards = {};
      for (const x of [cards[i]!, cards[j]!]) c[x] = (c[x] ?? 0) + 1;
      const key = JSON.stringify(Object.entries(c).sort());
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
  return out;
}

/** Can the Great Dragon take this track's top improvement from the target? */
function dragonBlock(ctx: Ctx, seat: number, target: number, track: Track): string | null {
  const theirs = levels(ctx, target)[track];
  if (theirs < 1) return 'They have no improvement there';
  if (theirs >= MAX_LEVEL) return 'A finished metropolis can not be taken';
  if (levels(ctx, seat)[track] !== theirs - 1) return 'You need the level just below theirs';
  if (!citiesOf(ctx, seat).length) return 'You need a city';
  if (!seatAllows(ctx, seat, track)) return 'You need the city that opens that track';
  if (theirs > 3 && rivalMetropolis(ctx, seat, track)) return 'That track stops at level 3 for you';
  return null;
}

function discardLimit(ctx: Ctx, seat: number): number {
  return ctx.reduce('handLimit', seat, ctx.setting<number>('discardLimit') ?? 7);
}

// ---- The cards ----

export const CARDS = defineFanCards({
  lightning: {
    count: 1,
    check: (ctx) => (fertile(ctx).length ? null : 'There is no land to strike'),
    apply: pick('lightning'),
  },
  greatDragon: {
    count: 1,
    aims: true,
    options: (ctx, seat) =>
      others(ctx, seat).flatMap((target) =>
        activeTracks(ctx).map((option) => ({ target, option })),
      ),
    check(ctx, a) {
      const e = pickTarget(ctx, a);
      if (e) return e;
      if (!activeTracks(ctx).includes(a.option as Track)) return 'Pick a track';
      return dragonBlock(ctx, a.player, a.target as number, a.option as Track);
    },
    apply(ctx, a) {
      const track = a.option as Track;
      const target = a.target as number;
      ctx.emit({ type: 'greatDragon', player: a.player, target, track });
      // The metropolis goes with level 4.
      lowerTrack(ctx, target, track);
      raiseTrack(ctx, a.player, track);
    },
  },
  starFavor: {
    count: 1,
    check: (ctx) => (numbered(ctx).length >= 2 ? null : 'There are no numbers to swap'),
    apply: pick('starFavor'),
  },
  witchSpell: {
    count: 1,
    aims: true,
    options: targets,
    check: (ctx, a) =>
      pickTarget(ctx, a) ??
      (knightsOf(ctx, a.target as number).length ? null : 'That player has no knights'),
    apply(ctx, a) {
      const target = a.target as number;
      for (const k of knightsOf(ctx, target)) {
        k.props.active = false;
        delete k.props.activatedTurn;
      }
      witchesData(ctx).spell = { target, until: ctx.state.turn.number + 3 };
      ctx.emit({ type: 'knightsDeactivated', player: a.player, target, card: 'witchSpell' });
    },
  },
  smallDragon: {
    count: 1,
    when: 'discard',
    check: (ctx, a) =>
      ctx.handSize(a.player) <= discardLimit(ctx, a.player) + SMALL_DRAGON_EXTRA
        ? null
        : 'You would still hold too many cards',
    apply(ctx, a) {
      const ph = ctx.state.phase;
      const owed = { ...(ph.owed as Record<number, number>) };
      delete owed[a.player];
      ctx.emit({ type: 'smallDragon', player: a.player });
      if (Object.keys(owed).length) ctx.setPhase({ ...ph, owed });
      else if (ph.skipRobber) ctx.setPhase({ id: (ph.returnTo as string | undefined) ?? 'main' });
      else ctx.setPhase({ id: 'moveRobber', returnTo: ph.returnTo });
    },
  },
  magicFortune: {
    count: 1,
    options: (ctx, seat) => twoOf(ctx, seat).map((cards) => ({ cards })),
    check(ctx, a) {
      if (ctx.supplyLeft(a.player, 'settlement') <= 0) return 'No settlements left';
      if (witchesView(ctx).fortune) return 'Magic Fortune is already working';
      const cost = ctx.cost('settlement', a.player);
      const c = a.cards ?? {};
      const n = Object.values(c).reduce((s, x) => s + x, 0);
      if (n !== 2 || Object.entries(c).some(([r, x]) => (cost[r] ?? 0) < x))
        return 'Pick two cards of the settlement price';
      return null;
    },
    apply(ctx, a) {
      witchesData(ctx).fortune = {
        seat: a.player,
        turn: ctx.state.turn.number,
        waive: { ...(a.cards as Cards) },
      };
      ctx.emit({ type: 'magicFortune', player: a.player, cards: a.cards });
    },
  },
  magicMove: {
    count: 1,
    check: (ctx, a) => (movable(ctx, a.player).length ? null : 'There is nowhere to move to'),
    apply: pick('magicMove'),
  },
  magicCurrent: {
    count: 1,
    options: () => [{ option: 'forward' }, { option: 'back' }],
    check(ctx, a) {
      if (a.option === 'back') return ckData(ctx).barbarian > 0 ? null : 'The ship is at the start';
      return a.option === 'forward' ? null : 'Pick forward or back';
    },
    apply(ctx, a) {
      const d = ckData(ctx);
      const len = barbarianTrack(ctx);
      d.barbarian =
        a.option === 'back' ? Math.max(0, d.barbarian - 2) : Math.min(len, d.barbarian + 2);
      ctx.emit({
        type: 'barbariansAdvance',
        at: d.barbarian,
        of: len,
        steps: a.option === 'back' ? -2 : 2,
      });
      if (d.barbarian >= len) landBarbarians(ctx, MAIN);
    },
  },
  unicornDance: {
    count: 1,
    when: 'roll',
    options: (ctx) => [...new Set(eventFaces(ctx))].map((option) => ({ option })),
    check: (ctx, a) =>
      (eventFaces(ctx) as readonly string[]).includes(a.option ?? '')
        ? null
        : 'Pick a face of the event die',
    apply(ctx, a) {
      ckData(ctx).forcedEvent = a.option as never;
      ctx.emit({ type: 'unicornDance', player: a.player, face: a.option });
    },
  },
  enchantedLand: {
    count: 1,
    check: (ctx) => (landHexes(ctx).length >= 2 ? null : 'There is no land to swap'),
    apply: pick('enchantedLand'),
  },
  whiteMagic: {
    // A point, face up as soon as it is drawn.
    count: 1,
    check: () => 'That card scores by itself',
    apply: () => undefined,
  },
  natureSpell: {
    count: 1,
    options: () => threeOf(RESOURCES).map((cards) => ({ cards })),
    check(ctx, a) {
      const c = a.cards ?? {};
      const n = Object.values(c).reduce((s, x) => s + x, 0);
      if (n !== 3 || Object.keys(c).some((r) => !(RESOURCES as readonly string[]).includes(r)))
        return 'Pick three resources';
      return ctx.bankHas(c) ? null : 'The bank has run out';
    },
    apply(ctx, a) {
      ctx.grant(a.player, a.cards as Cards);
      ctx.emit({ type: 'progressGain', player: a.player, card: a.card, cards: a.cards });
    },
  },
  wizard: {
    count: 3,
    check: (ctx, a) =>
      wizardSpots(ctx, a.player).length ? null : 'You have no settlement or city for the Wizard',
    apply: pick('wizard'),
  },
  magicFormula: {
    count: 1,
    check: (ctx, a) =>
      others(ctx, a.player).some((s) => progressCount(ctx, s) > 0)
        ? null
        : 'Nobody else has a progress card',
    apply(ctx, a) {
      const owed = Object.fromEntries(
        others(ctx, a.player)
          .filter((s) => progressCount(ctx, s) > 0)
          .map((s) => [s, 1]),
      );
      ctx.setPhase({ id: 'magicFormula', owed, by: a.player, pool: [], returnTo: MAIN });
    },
  },
  magicPower: {
    count: 1,
    when: ['beforeOrAfter', 'attack'],
    check: (ctx, a) =>
      witchesView(ctx).power?.includes(a.player) ? 'Your knights are already doubled' : null,
    apply(ctx, a) {
      (witchesData(ctx).power ??= []).push(a.player);
      ctx.emit({ type: 'magicPower', player: a.player });
    },
  },
  magicVeto: {
    // Answers a card aimed at you (see the shared veto step); when the ship
    // lands it keeps your cities from the barbarians.
    count: 1,
    when: 'attack',
    check(ctx, a) {
      if (ckData(ctx).refuge?.includes(a.player)) return 'Your cities are already safe';
      return attackHeld(ctx) ? 'The knights hold the barbarians off' : null;
    },
    apply(ctx, a) {
      (ckData(ctx).refuge ??= []).push(a.player);
      ctx.emit({ type: 'vetoed', player: a.player, card: 'barbarians' });
    },
  },
} satisfies Record<string, FanCard>);

/** The Magic deck for the tracks in play. */
export const magicDeck = (tracks: readonly string[] = MAGIC_TRACKS) => fanDeck(CARDS, tracks);

// ---- Steps after playing a card ----

const magicPick: ActionDef = {
  phases: ['magicPick'],
  check(ctx, a) {
    const ph = ctx.state.phase;
    if (a.player !== ph.by) return 'Not your card';
    const spots = pickSpots(ctx);
    if (typeof a.hex === 'string') return spots.hexes.includes(a.hex as HexId) ? null : 'Not there';
    if (typeof a.corner === 'string')
      return spots.corners.includes(a.corner as CornerId) ? null : 'Not there';
    return 'Pick a spot';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const seat = a.player;
    const first = ph.first as string | undefined;
    switch (ph.card) {
      case 'lightning': {
        const hex = ctx.state.hexes[a.hex as HexId]!;
        const was = hex.type;
        hex.type = 'desert';
        ctx.emit({ type: 'lightning', player: seat, hex: hex.id, was });
        ctx.hook('hexChanged', hex);
        break;
      }
      case 'starFavor':
      case 'enchantedLand': {
        if (!first) {
          ctx.setPhase({ ...ph, first: a.hex });
          return;
        }
        const x = ctx.state.hexes[first as HexId]!;
        const y = ctx.state.hexes[a.hex as HexId]!;
        const t = x.token;
        if (y.token === undefined) delete x.token;
        else x.token = y.token;
        if (t === undefined) delete y.token;
        else y.token = t;
        if (ph.card === 'enchantedLand') {
          [x.type, y.type] = [y.type, x.type];
          ctx.emit({ type: 'landSwapped', player: seat, hexes: [x.id, y.id] });
        } else ctx.emit({ type: 'numbersSwapped', player: seat, hexes: [x.id, y.id] });
        ctx.hook('hexChanged', x);
        ctx.hook('hexChanged', y);
        break;
      }
      case 'wizard':
        placeWizard(ctx, seat, a.corner as CornerId);
        break;
      case 'magicMove': {
        if (!first) {
          ctx.setPhase({ ...ph, first: a.corner });
          return;
        }
        moveBuilding(ctx, seat, first as CornerId, a.corner as CornerId);
        break;
      }
    }
    back(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.state.phase.by) return [];
    const { hexes, corners } = pickSpots(ctx);
    return [
      ...hexes.map((hex) => ({ type: 'magicPick', player, hex })),
      ...corners.map((corner) => ({ type: 'magicPick', player, corner })),
    ];
  },
};

/** Magic Move: the building, its wall, metropolis, seat and Wizard go to a new corner. */
function moveBuilding(ctx: Ctx, seat: number, from: CornerId, to: CornerId): void {
  const b = ctx.buildingAt(from);
  if (!b) return;
  const wizard = wizardPiece(ctx);
  ctx.move(b, { kind: 'corner', id: to });
  if (wizard?.at.kind === 'corner' && wizard.at.id === from)
    ctx.move(wizard, { kind: 'corner', id: to });
  const d = ckData(ctx);
  for (const m of Object.values(d.metropolis)) if (m && m.corner === from) m.corner = to;
  for (const bySeat of Object.values(d.seats ?? {})) if (bySeat[seat] === from) bySeat[seat] = to;
  ctx.emit({ type: 'magicMove', player: seat, from, to, piece: b.type });
}

/** Magic Formula: each other player hands over a progress card of their choice. */
const formulaGive: ActionDef = {
  phases: ['magicFormula'],
  check(ctx, a) {
    if (!(ctx.state.phase.owed as Record<number, number>)[a.player]) return 'You owe nothing';
    return progressHeld(ctx, a.player).some((h) => h.card === a.card && h.deck === a.deck)
      ? null
      : 'You do not hold that card';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const by = ph.by as number;
    takeHeld(ctx, a.player, a.deck as Track, a.card as string);
    const pool = [...(ph.pool as Pooled[]), { card: a.card as string, deck: a.deck as Track }];
    ctx.emit({ type: 'progressTaken', player: by, from: a.player, deck: a.deck });
    const owed = { ...(ph.owed as Record<number, number>) };
    delete owed[a.player];
    if (Object.keys(owed).length) {
      ctx.setPhase({ ...ph, owed, pool });
      return;
    }
    ctx.setPhase(ph.returnTo as Phase);
    keepOne(ctx, by, pool, ph.returnTo as Phase);
  },
  enumerate(ctx, player) {
    if (!(ctx.state.phase.owed as Record<number, number>)[player]) return [];
    const seen = new Set<string>();
    return progressHeld(ctx, player).flatMap(({ card, deck }) => {
      const key = `${deck}:${card}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ type: 'formulaGive', player, card, deck }];
    });
  },
};

/** Witch's Spell: no activating knights until it lifts. */
export function wrapActivate(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      if (spellOn(ctx, a.player)) return 'A witch has bewitched your knights';
      return prev.check(ctx, a);
    },
  };
}

export const cardActions: Record<string, ActionDef> = { magicPick, formulaGive };
