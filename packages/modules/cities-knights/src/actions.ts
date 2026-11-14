import {
  type Action,
  type ActionDef,
  type CornerId,
  type Ctx,
  type Phase,
  type Piece,
} from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { KNIGHT_TYPES, MAX_LEVEL, MAX_WALLS, METROPOLIS_LEVEL, type Track } from './constants.ts';
import {
  activeTracks,
  canAct,
  canPlaceKnight,
  ckData,
  continueRoll,
  gateDraws,
  displaceTargets,
  drawProgress,
  cityAtRisk,
  freeCities,
  progressHeld,
  improveBlock,
  improveCost,
  isActive,
  isActiveTrack,
  isKnight,
  knightAt,
  knightLevel,
  knightsOf,
  levels,
  moveTargets,
  pillage,
  promote,
  promoteBlock,
  relocateTargets,
  setMetropolis,
  wallsOf,
  wildDecks,
  winsMetropolis,
} from './rules.ts';

type A<T> = Action & T;

export function action<T>(def: ActionDef<A<T>>): ActionDef {
  return def as unknown as ActionDef;
}

export const onlyActive = (ctx: Ctx, a: Action): string | null =>
  a.player === ctx.active ? null : 'Not your turn';

export function phase<T>(ctx: Ctx): T {
  return ctx.state.phase as unknown as T;
}

export interface OwedPhase extends Phase {
  owed: Record<number, number>;
}

export function owes(ctx: Ctx, seat: number): boolean {
  const owed = (ctx.state.phase as Partial<OwedPhase>).owed;
  return !!owed && !!owed[seat];
}

/** Takes a seat off the phase's list. Returns true when nobody is left. */
export function settle(ctx: Ctx, seat: number): boolean {
  const ph = phase<OwedPhase>(ctx);
  const owed = { ...ph.owed };
  delete owed[seat];
  if (Object.keys(owed).length) {
    ctx.setPhase({ ...ph, owed });
    return false;
  }
  return true;
}

function afford(ctx: Ctx, seat: number, item: string, what: string): string | null {
  return ctx.has(seat, ctx.cost(item, seat)) ? null : `You can not afford to ${what}`;
}

function ownKnight(ctx: Ctx, seat: number, id: unknown): Piece | undefined {
  const k = typeof id === 'string' ? ctx.state.pieces[id] : undefined;
  return k && isKnight(k) && k.owner === seat && k.at.kind === 'corner' ? k : undefined;
}

export function cornerOf(p: Piece): CornerId {
  return (p.at as { id: CornerId }).id;
}

// ---- Knights ----

const buildKnight = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? afford(ctx, a.player, 'knight', 'raise a knight');
    if (err) return err;
    if (ctx.supplyLeft(a.player, 'knight1') <= 0) return 'No basic knights left';
    return canPlaceKnight(ctx, a.player, a.corner);
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('knight', a.player));
    ctx.place('knight1', a.player, { kind: 'corner', id: a.corner }, { active: false });
    ctx.emit({ type: 'built', player: a.player, piece: 'knight', at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !ctx.has(player, ctx.cost('knight', player))) return [];
    const corners = new Set<CornerId>();
    for (const p of ctx.piecesOf(player))
      if (p.at.kind === 'edge')
        for (const c of ctx.geometry.edgeCorners.get(p.at.id) ?? []) corners.add(c);
    return [...corners].map((corner) => ({ type: 'buildKnight', player, corner }));
  },
});

const activateKnight = action<{ knight: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? afford(ctx, a.player, 'activate', 'activate a knight');
    if (err) return err;
    const k = ownKnight(ctx, a.player, a.knight);
    if (!k) return 'That is not your knight';
    if (isActive(k)) return 'That knight is already active';
    return null;
  },
  apply(ctx, a) {
    const k = ownKnight(ctx, a.player, a.knight) as Piece;
    ctx.pay(a.player, ctx.cost('activate', a.player));
    k.props.active = true;
    k.props.activatedTurn = ctx.state.turn.number;
    ctx.emit({ type: 'knightActivated', player: a.player, at: cornerOf(k) });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return knightsOf(ctx, player)
      .filter((k) => !isActive(k))
      .map((k) => ({ type: 'activateKnight', player, knight: k.id }));
  },
});

const promoteKnight = action<{ knight: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? afford(ctx, a.player, 'promote', 'promote a knight');
    if (err) return err;
    return promoteBlock(ctx, a.player, ownKnight(ctx, a.player, a.knight));
  },
  apply(ctx, a) {
    const k = ownKnight(ctx, a.player, a.knight) as Piece;
    ctx.pay(a.player, ctx.cost('promote', a.player));
    const n = promote(ctx, k);
    ctx.emit({ type: 'knightPromoted', player: a.player, at: cornerOf(n), level: knightLevel(n) });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return knightsOf(ctx, player).map((k) => ({ type: 'promoteKnight', player, knight: k.id }));
  },
});

const moveKnight = action<{ knight: string; to: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const k = ownKnight(ctx, a.player, a.knight);
    if (!k) return 'That is not your knight';
    if (!canAct(ctx, k)) return 'Only an active knight that was not activated this turn can move';
    if (!moveTargets(ctx, k).includes(a.to))
      return 'Knights move along your roads to an empty corner';
    return null;
  },
  apply(ctx, a) {
    const k = ownKnight(ctx, a.player, a.knight) as Piece;
    const from = cornerOf(k);
    ctx.move(k, { kind: 'corner', id: a.to });
    k.props.active = false;
    ctx.emit({ type: 'knightMoved', player: a.player, from, to: a.to });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return knightsOf(ctx, player)
      .filter((k) => canAct(ctx, k))
      .flatMap((k) =>
        moveTargets(ctx, k).map((to) => ({ type: 'moveKnight', player, knight: k.id, to })),
      );
  },
});

/** Pushes a rival knight off its corner; its owner then picks where it goes. */
export function pushAway(ctx: Ctx, victim: Piece, from: CornerId, returnTo: Phase): void {
  const owner = victim.owner as number;
  const options = relocateTargets(ctx, owner, from).filter((c) => c !== from);
  if (!options.length) {
    ctx.remove(victim);
    ctx.emit({ type: 'knightLost', player: owner, at: from });
    ctx.setPhase(returnTo);
    return;
  }
  ctx.move(victim, { kind: 'supply' });
  ctx.setPhase({ id: 'relocateKnight', owed: { [owner]: 1 }, knight: victim.id, from, returnTo });
}

const displaceKnight = action<{ knight: string; to: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const k = ownKnight(ctx, a.player, a.knight);
    if (!k) return 'That is not your knight';
    if (!canAct(ctx, k)) return 'Only an active knight that was not activated this turn can attack';
    if (!displaceTargets(ctx, k).includes(a.to))
      return 'You can only push away a weaker knight your roads reach';
    return null;
  },
  apply(ctx, a) {
    const k = ownKnight(ctx, a.player, a.knight) as Piece;
    const victim = knightAt(ctx, a.to) as Piece;
    const from = cornerOf(k);
    ctx.move(victim, { kind: 'supply' });
    ctx.move(k, { kind: 'corner', id: a.to });
    k.props.active = false;
    ctx.emit({
      type: 'knightDisplaced',
      player: a.player,
      victim: victim.owner,
      from,
      at: a.to,
    });
    pushAway(ctx, victim, a.to, { id: 'main' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return knightsOf(ctx, player)
      .filter((k) => canAct(ctx, k))
      .flatMap((k) =>
        displaceTargets(ctx, k).map((to) => ({ type: 'displaceKnight', player, knight: k.id, to })),
      );
  },
});

interface RelocatePhase extends OwedPhase {
  id: 'relocateKnight';
  knight: string;
  from: CornerId;
  returnTo: Phase;
}

const relocateKnight = action<{ corner: CornerId }>({
  phases: ['relocateKnight'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not your knight';
    const ph = phase<RelocatePhase>(ctx);
    if (a.corner === ph.from || !relocateTargets(ctx, a.player, ph.from).includes(a.corner))
      return 'Pick an empty corner on your roads';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<RelocatePhase>(ctx);
    const k = ctx.state.pieces[ph.knight] as Piece;
    ctx.move(k, { kind: 'corner', id: a.corner });
    ctx.emit({ type: 'knightMoved', player: a.player, from: ph.from, to: a.corner });
    ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    const ph = phase<RelocatePhase>(ctx);
    return relocateTargets(ctx, player, ph.from)
      .filter((c) => c !== ph.from)
      .map((corner) => ({ type: 'relocateKnight', player, corner }));
  },
});

const chaseRobber = action<{ knight: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!ckData(ctx).robberActive) return 'The robber is not in play until the barbarians attack';
    const k = ownKnight(ctx, a.player, a.knight);
    if (!k) return 'That is not your knight';
    if (!canAct(ctx, k))
      return 'Only an active knight that was not activated this turn can chase the robber';
    const r = ctx.piecesOfType('robber')[0];
    if (r?.at.kind !== 'hex') return 'The robber is not on the board';
    if (!(ctx.geometry.hexCorners.get(r.at.id) ?? []).includes(cornerOf(k)))
      return 'The knight must stand next to the robber';
    return null;
  },
  apply(ctx, a) {
    const k = ownKnight(ctx, a.player, a.knight) as Piece;
    k.props.active = false;
    ctx.emit({ type: 'robberChased', player: a.player, at: cornerOf(k) });
    ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return knightsOf(ctx, player).map((k) => ({ type: 'chaseRobber', player, knight: k.id }));
  },
});

// ---- Walls and improvements ----

const buildWall = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? afford(ctx, a.player, 'wall', 'build a city wall');
    if (err) return err;
    return wallBlock(ctx, a.player, a.corner);
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('wall', a.player));
    (ctx.buildingAt(a.corner) as Piece).props.wall = true;
    ctx.emit({ type: 'built', player: a.player, piece: 'wall', at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx
      .piecesOf(player, 'city')
      .map((c) => ({ type: 'buildWall', player, corner: cornerOf(c) }));
  },
});

export function wallBlock(ctx: Ctx, seat: number, corner: CornerId): string | null {
  const b = ctx.buildingAt(corner);
  if (!b || b.type !== 'city' || b.owner !== seat) return 'City walls go around one of your cities';
  if (b.props.wall) return 'That city already has a wall';
  if (wallsOf(ctx, seat) >= MAX_WALLS) return `You can only build ${MAX_WALLS} city walls`;
  return null;
}

const improveCity = action<{ track: Track }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!isActiveTrack(ctx, a.track)) return `Pick ${activeTracks(ctx).join(', ')}`;
    return improveBlock(ctx, a.player, a.track);
  },
  apply(ctx, a) {
    const d = ckData(ctx);
    ctx.pay(a.player, improveCost(ctx, a.player, a.track));
    delete d.craneTurn[a.player];
    const lv = levels(ctx, a.player);
    lv[a.track] += 1;
    ctx.emit({ type: 'improved', player: a.player, track: a.track, level: lv[a.track] });
    if (winsMetropolis(ctx, a.player, a.track, lv[a.track])) {
      claimMetropolis(ctx, a.player, a.track, ctx.state.phase);
    }
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return activeTracks(ctx).map((track) => ({ type: 'improveCity', player, track }));
  },
});

export function claimMetropolis(ctx: Ctx, seat: number, track: Track, returnTo: Phase): void {
  const open = freeCities(ctx, seat);
  if (!open.length) return;
  if (open.length === 1) {
    setMetropolis(ctx, seat, track, open[0] as Piece);
    return;
  }
  ctx.setPhase({ id: 'placeMetropolis', owed: { [seat]: 1 }, track, returnTo });
}

/** Raises a track a level for free, claiming the metropolis if it is now won. */
export function raiseTrack(ctx: Ctx, seat: number, track: Track): boolean {
  const lv = levels(ctx, seat);
  if (lv[track] >= MAX_LEVEL) return false;
  lv[track] += 1;
  ctx.emit({ type: 'improved', player: seat, track, level: lv[track], free: true });
  if (winsMetropolis(ctx, seat, track, lv[track]))
    claimMetropolis(ctx, seat, track, ctx.state.phase);
  return true;
}

/** Drops a track a level; below level 4 its metropolis is lost. */
export function lowerTrack(ctx: Ctx, seat: number, track: Track): boolean {
  const lv = levels(ctx, seat);
  if (lv[track] <= 0) return false;
  lv[track] -= 1;
  ctx.emit({ type: 'trackLowered', player: seat, track, level: lv[track] });
  const d = ckData(ctx);
  const m = d.metropolis[track];
  if (m && m.seat === seat && lv[track] < METROPOLIS_LEVEL) {
    const city = ctx.buildingAt(m.corner);
    if (city) delete city.props.metropolis;
    delete d.metropolis[track];
    ctx.emit({ type: 'metropolisLost', player: seat, track });
  }
  return true;
}

interface MetropolisPhase extends OwedPhase {
  track: Track;
  returnTo: Phase;
}

const placeMetropolis = action<{ corner: CornerId }>({
  phases: ['placeMetropolis'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not your metropolis';
    const b = ctx.buildingAt(a.corner);
    if (!b || b.type !== 'city' || b.owner !== a.player || b.props.metropolis)
      return 'Pick one of your cities without a metropolis';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<MetropolisPhase>(ctx);
    setMetropolis(ctx, a.player, ph.track, ctx.buildingAt(a.corner) as Piece);
    ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return freeCities(ctx, player).map((c) => ({
      type: 'placeMetropolis',
      player,
      corner: cornerOf(c),
    }));
  },
});

// ---- Barbarian aftermath ----

const pillageCity = action<{ corner: CornerId }>({
  phases: ['loseCity'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'You do not lose a city';
    const b = ctx.buildingAt(a.corner);
    if (!b || !cityAtRisk(ctx, a.player).includes(b))
      return 'Pick one of your cities without a metropolis';
    return null;
  },
  apply(ctx, a) {
    const d = ckData(ctx);
    pillage(ctx, ctx.buildingAt(a.corner) as Piece);
    d.pendingLoss = d.pendingLoss.filter((s) => s !== a.player);
    if (settle(ctx, a.player)) continueRoll(ctx);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return cityAtRisk(ctx, player).map((c) => ({
      type: 'pillageCity',
      player,
      corner: cornerOf(c),
    }));
  },
});

const pickDefenderCard = action<{ deck: Track }>({
  phases: ['defenderPick'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'You have no card to pick';
    if (!isActiveTrack(ctx, a.deck)) return 'Pick a deck';
    if (!ctx.state.decks[a.deck]?.length) return 'That deck is empty';
    return null;
  },
  apply(ctx, a) {
    const d = ckData(ctx);
    drawProgress(ctx, a.player, a.deck);
    d.pendingDefender = d.pendingDefender.filter((s) => s !== a.player);
    const done = settle(ctx, a.player);
    const anyDeck = activeTracks(ctx).some((t) => (ctx.state.decks[t]?.length ?? 0) > 0);
    if (done || !anyDeck) {
      d.pendingDefender = [];
      continueRoll(ctx);
    }
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return activeTracks(ctx).map((deck) => ({ type: 'pickDefenderCard', player, deck }));
  },
});

/** A wild face on the event die: draw one card from any deck your levels allow. */
const pickWildCard = action<{ deck: Track }>({
  phases: ['wildPick'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'You have no card to pick';
    if (!wildDecks(ctx, a.player, ckData(ctx).wildRed).includes(a.deck))
      return 'Your improvements do not open that deck for this roll';
    return null;
  },
  apply(ctx, a) {
    const d = ckData(ctx);
    drawProgress(ctx, a.player, a.deck);
    d.pendingWild = d.pendingWild.filter((s) => s !== a.player);
    continueRoll(ctx);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return wildDecks(ctx, player, ckData(ctx).wildRed).map((deck) => ({
      type: 'pickWildCard',
      player,
      deck,
    }));
  },
});

/** A joker on the event die: the roller picks the track, then that gate opens for everyone. */
const pickJoker = action<{ deck: Track }>({
  phases: ['jokerPick'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not your pick';
    return activeTracks(ctx).includes(a.deck) ? null : 'Pick a track';
  },
  apply(ctx, a) {
    const d = ckData(ctx);
    d.pendingJoker = null;
    ctx.emit({ type: 'jokerPicked', player: a.player, deck: a.deck });
    gateDraws(ctx, a.deck, d.wildRed);
    continueRoll(ctx);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return activeTracks(ctx).map((deck) => ({ type: 'pickJoker', player, deck }));
  },
});

interface ProgressDiscardPhase extends OwedPhase {
  returnTo: Phase;
}

/** Over the progress card limit: put one back under its deck. */
const returnProgress = action<{ deck: Track; card: string }>({
  phases: ['progressDiscard'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'You have nothing to put back';
    if (!isActiveTrack(ctx, a.deck)) return 'Pick a card';
    const held = ctx.player(a.player).held[a.deck] ?? [];
    if (!held.some((h) => h.card === a.card)) return 'You do not hold that card';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<ProgressDiscardPhase>(ctx);
    const held = ctx.player(a.player).held[a.deck] ?? [];
    held.splice(
      held.findIndex((h) => h.card === a.card),
      1,
    );
    (ctx.state.decks[a.deck] ??= []).push(a.card);
    ctx.emit({
      type: 'progressReturned',
      player: a.player,
      deck: a.deck,
      card: a.card,
      visibleTo: [a.player],
      redacted: { player: a.player, deck: a.deck },
    });
    const owed = { ...ph.owed };
    owed[a.player] = (owed[a.player] ?? 1) - 1;
    if (owed[a.player]! <= 0) delete owed[a.player];
    if (Object.keys(owed).length) ctx.setPhase({ ...ph, owed });
    else ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    const seen = new Set<string>();
    return progressHeld(ctx, player).flatMap(({ card, deck }) => {
      if (seen.has(`${deck}:${card}`)) return [];
      seen.add(`${deck}:${card}`);
      return [{ type: 'returnProgress', player, deck, card }];
    });
  },
});

interface AqueductPhase extends OwedPhase {
  returnTo: Phase;
}

const aqueductPick = action<{ card: string }>({
  phases: ['aqueduct'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'You have nothing to pick';
    if (!(RESOURCES as readonly string[]).includes(a.card)) return 'Pick a resource';
    if (!ctx.bankHas({ [a.card]: 1 })) return 'The bank has none left';
    return null;
  },
  apply(ctx, a) {
    const ph = phase<AqueductPhase>(ctx);
    ctx.grant(a.player, { [a.card]: 1 });
    ctx.emit({ type: 'aqueduct', player: a.player, cards: { [a.card]: 1 } });
    if (settle(ctx, a.player)) ctx.setPhase(ph.returnTo);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return RESOURCES.map((card) => ({ type: 'aqueductPick', player, card }));
  },
});

export const knightActions: Record<string, ActionDef> = {
  buildKnight,
  activateKnight,
  promoteKnight,
  moveKnight,
  displaceKnight,
  relocateKnight,
  chaseRobber,
  buildWall,
  improveCity,
  placeMetropolis,
  pillageCity,
  pickDefenderCard,
  pickWildCard,
  pickJoker,
  returnProgress,
  aqueductPick,
};

export { KNIGHT_TYPES };
