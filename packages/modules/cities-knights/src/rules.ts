import type {
  ActionDef,
  Cards,
  CornerId,
  Ctx,
  DiceResult,
  HexId,
  Phase,
  Piece,
} from '@colonizers/engine';
import { baseData, RESOURCES, routesAt } from '@colonizers/module-base';
import {
  ABILITY_LEVEL,
  COMMODITIES,
  DEFENDER_CARDS,
  EVENT_FACES,
  KNIGHT_TYPES,
  MAX_LEVEL,
  METROPOLIS_LEVEL,
  MODULE_ID,
  PROGRESS_HAND_LIMIT,
  TRACK_COMMODITY,
  TRACKS,
  VP_PROGRESS,
  type EventFace,
  type Track,
} from './constants.ts';

export type Levels = Record<Track, number>;

export interface CkData extends Record<string, unknown> {
  /** Barbarian ship position, from 0 up to the track length. */
  barbarian: number;
  /** Attacks so far. The robber stays put until the first one. */
  attacks: number;
  robberActive: boolean;
  levels: Record<number, Levels>;
  metropolis: Partial<Record<Track, { seat: number; corner: CornerId }>>;
  /** Defender of Catan cards earned. */
  defender: Record<number, number>;
  /** Dice to use for the roll being worked out right now. */
  forcedRoll: DiceResult | null;
  /** Alchemist: the production dice the player chose. */
  alchemist: { red: number; yellow: number } | null;
  /** Turn on which each player played a Crane. */
  craneTurn: Record<number, number>;
  /** Merchant Fleet: one card type traded 2:1 for the rest of the turn. */
  fleet: { seat: number; card: string; turn: number } | null;
  /** Players who still have to give up a city after a lost attack. */
  pendingLoss: number[];
  /** Players who tied as best defender and still pick a progress card. */
  pendingDefender: number[];
  /** Cards one player may look at (Master Merchant, Spy). Hidden from everyone else. */
  peek: { seat: number; target: number; hand?: Cards; progress?: string[] } | null;
}

export function ckData(ctx: Ctx): CkData {
  const d = ctx.data<CkData>(MODULE_ID);
  d.barbarian ??= 0;
  d.attacks ??= 0;
  d.robberActive ??= false;
  d.levels ??= {};
  d.metropolis ??= {};
  d.defender ??= {};
  d.forcedRoll ??= null;
  d.alchemist ??= null;
  d.craneTurn ??= {};
  d.fleet ??= null;
  d.pendingLoss ??= [];
  d.pendingDefender ??= [];
  d.peek ??= null;
  return d;
}

export function levels(ctx: Ctx, seat: number): Levels {
  const d = ckData(ctx);
  return (d.levels[seat] ??= { science: 0, trade: 0, politics: 0 });
}

export function hasAbility(ctx: Ctx, seat: number, track: Track): boolean {
  return levels(ctx, seat)[track] >= ABILITY_LEVEL;
}

// ---- Knights ----

export function isKnight(p: Piece): boolean {
  return (KNIGHT_TYPES as readonly string[]).includes(p.type);
}

export function knightLevel(p: Piece): number {
  return (KNIGHT_TYPES as readonly string[]).indexOf(p.type) + 1;
}

export function knightsOf(ctx: Ctx, seat: number): Piece[] {
  return ctx.piecesOf(seat).filter(isKnight);
}

export function isActive(p: Piece): boolean {
  return p.props.active === true;
}

/** Active, and not switched on this turn (a knight can't act on the turn it is activated). */
export function canAct(ctx: Ctx, p: Piece): boolean {
  return isActive(p) && p.props.activatedTurn !== ctx.state.turn.number;
}

export function strength(ctx: Ctx, seat: number): number {
  return knightsOf(ctx, seat)
    .filter(isActive)
    .reduce((s, k) => s + knightLevel(k), 0);
}

export function knightAt(ctx: Ctx, corner: CornerId): Piece | undefined {
  return ctx.piecesAt({ kind: 'corner', id: corner }).find(isKnight);
}

export function cornerFree(ctx: Ctx, corner: CornerId): boolean {
  return ctx.piecesAt({ kind: 'corner', id: corner }).length === 0;
}

/** A new knight goes on an empty land corner touching one of the player's roads or ships. */
export function canPlaceKnight(ctx: Ctx, seat: number, corner: CornerId): string | null {
  if (!ctx.geometry.cornerHexes.has(corner)) return 'That corner is not on the board';
  if (!ctx.isLandCorner(corner)) return 'Knights stand on land';
  if (!cornerFree(ctx, corner)) return 'That corner is taken';
  if (routesAt(ctx, seat, corner).length === 0) return 'Knights must stand on one of your roads';
  return null;
}

/**
 * Corners a knight can reach along its owner's roads and ships. It can pass
 * the owner's own pieces but not anyone else's.
 */
export function reachable(ctx: Ctx, seat: number, from: CornerId): Set<CornerId> {
  const seen = new Set<CornerId>([from]);
  const queue: CornerId[] = [from];
  while (queue.length) {
    const c = queue.shift() as CornerId;
    if (c !== from) {
      const others = ctx.piecesAt({ kind: 'corner', id: c }).some((p) => p.owner !== seat);
      if (others) continue;
    }
    for (const e of ctx.geometry.cornerEdges.get(c) ?? []) {
      const mine = ctx
        .piecesAt({ kind: 'edge', id: e })
        .some((p) => p.owner === seat && !!ctx.registry.pieceTypes[p.type]?.route);
      if (!mine) continue;
      for (const n of ctx.geometry.edgeCorners.get(e) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
  }
  seen.delete(from);
  return seen;
}

/** Empty corners a knight could step to. */
export function moveTargets(ctx: Ctx, knight: Piece): CornerId[] {
  if (knight.at.kind !== 'corner' || knight.owner === null) return [];
  return [...reachable(ctx, knight.owner, knight.at.id)].filter(
    (c) => ctx.isLandCorner(c) && cornerFree(ctx, c),
  );
}

/** Corners with a weaker rival knight this knight could push away. */
export function displaceTargets(ctx: Ctx, knight: Piece): CornerId[] {
  if (knight.at.kind !== 'corner' || knight.owner === null) return [];
  const seat = knight.owner;
  const out: CornerId[] = [];
  // Rival corners stop the search, so look one step past the reachable set.
  const near = new Set<CornerId>([knight.at.id, ...reachable(ctx, seat, knight.at.id)]);
  for (const c of near) {
    for (const e of ctx.geometry.cornerEdges.get(c) ?? []) {
      const mine = ctx
        .piecesAt({ kind: 'edge', id: e })
        .some((p) => p.owner === seat && !!ctx.registry.pieceTypes[p.type]?.route);
      if (!mine) continue;
      for (const n of ctx.geometry.edgeCorners.get(e) ?? []) {
        const other = knightAt(ctx, n);
        if (other && other.owner !== seat && knightLevel(other) < knightLevel(knight))
          if (!out.includes(n)) out.push(n);
      }
    }
  }
  return out;
}

/** Where a pushed-away knight can go: empty corners its owner's roads reach from where it stood. */
export function relocateTargets(ctx: Ctx, seat: number, from: CornerId): CornerId[] {
  return [...reachable(ctx, seat, from)].filter((c) => ctx.isLandCorner(c) && cornerFree(ctx, c));
}

/** Why a knight can't be promoted, or null. */
export function promoteBlock(ctx: Ctx, seat: number, k: Piece | undefined): string | null {
  if (!k || !isKnight(k) || k.owner !== seat) return 'That is not your knight';
  const level = knightLevel(k);
  if (level >= 3) return 'That knight is already mighty';
  if (level === 2 && !hasAbility(ctx, seat, 'politics'))
    return 'Mighty knights need politics level 3 (the fortress)';
  if (k.props.promotedTurn === ctx.state.turn.number)
    return 'A knight can be promoted once per turn';
  const next = KNIGHT_TYPES[level] as string;
  if (ctx.supplyLeft(seat, next) <= 0) return 'No stronger knights left';
  return null;
}

export function promote(ctx: Ctx, k: Piece): Piece {
  const next = KNIGHT_TYPES[knightLevel(k)] as string;
  const n = ctx.upgrade(k, next);
  n.props.promotedTurn = ctx.state.turn.number;
  return n;
}

// ---- Cities, walls, metropolises ----

export function citiesOf(ctx: Ctx, seat: number): Piece[] {
  return ctx.piecesOf(seat, 'city');
}

export function wallsOf(ctx: Ctx, seat: number): number {
  return citiesOf(ctx, seat).filter((c) => c.props.wall === true).length;
}

export function freeCities(ctx: Ctx, seat: number): Piece[] {
  return citiesOf(ctx, seat).filter((c) => !c.props.metropolis);
}

/** Commodities the next level of a track costs this player. */
export function improveCost(ctx: Ctx, seat: number, track: Track): Cards {
  const level = levels(ctx, seat)[track];
  let n = level + 1;
  if (ckData(ctx).craneTurn[seat] === ctx.state.turn.number) n = Math.max(0, n - 1);
  return n > 0 ? { [TRACK_COMMODITY[track]]: n } : {};
}

/** Reaching this level would win the track's metropolis. */
export function winsMetropolis(ctx: Ctx, seat: number, track: Track, level: number): boolean {
  if (level < METROPOLIS_LEVEL) return false;
  const holder = ckData(ctx).metropolis[track];
  if (!holder) return true;
  if (holder.seat === seat) return false;
  return level === MAX_LEVEL && levels(ctx, holder.seat)[track] < MAX_LEVEL;
}

export function improveBlock(ctx: Ctx, seat: number, track: Track): string | null {
  const level = levels(ctx, seat)[track];
  if (level >= MAX_LEVEL) return 'That track is complete';
  if (!citiesOf(ctx, seat).length) return 'You need a city to build city improvements';
  if (winsMetropolis(ctx, seat, track, level + 1) && !freeCities(ctx, seat).length)
    return 'You need a city without a metropolis';
  if (!ctx.has(seat, improveCost(ctx, seat, track)))
    return `You need ${level + 1 - (ckData(ctx).craneTurn[seat] === ctx.state.turn.number ? 1 : 0)} ${TRACK_COMMODITY[track]}`;
  return null;
}

/** Puts a track's metropolis on a city. */
export function setMetropolis(ctx: Ctx, seat: number, track: Track, city: Piece): void {
  const d = ckData(ctx);
  const old = d.metropolis[track];
  if (old) {
    const prev = ctx.buildingAt(old.corner);
    if (prev) delete prev.props.metropolis;
  }
  city.props.metropolis = track;
  d.metropolis[track] = { seat, corner: (city.at as { id: CornerId }).id };
  ctx.emit({
    type: 'metropolis',
    player: seat,
    track,
    from: old?.seat ?? null,
    at: (city.at as { id: CornerId }).id,
  });
}

/** Turns a city back into a settlement (barbarians). Walls go with it. */
export function pillage(ctx: Ctx, city: Piece): void {
  const owner = city.owner as number;
  const at = city.at as { kind: 'corner'; id: CornerId };
  if (ctx.supplyLeft(owner, 'settlement') > 0) {
    const s = ctx.upgrade(city, 'settlement');
    delete s.props.wall;
    delete s.props.metropolis;
  } else {
    ctx.remove(city);
  }
  ctx.emit({ type: 'pillaged', player: owner, at: at.id });
}

// ---- Progress cards ----

export function progressHeld(ctx: Ctx, seat: number): { card: string; deck: Track }[] {
  const p = ctx.player(seat);
  return TRACKS.flatMap((t) => (p.held[t] ?? []).map((h) => ({ card: h.card, deck: t })));
}

export function progressCount(ctx: Ctx, seat: number): number {
  return TRACKS.reduce((s, t) => s + (ctx.player(seat).held[t]?.length ?? 0), 0);
}

/** Gives a progress card to a player. Victory point cards go face up at once. */
export function giveProgress(ctx: Ctx, seat: number, deck: Track, card: string): void {
  const p = ctx.player(seat);
  if ((VP_PROGRESS as readonly string[]).includes(card)) {
    p.played[card] = (p.played[card] ?? 0) + 1;
    ctx.emit({ type: 'progressVp', player: seat, card });
    return;
  }
  (p.held[deck] ??= []).push({ card, acquiredTurn: ctx.state.turn.number });
  ctx.emit({
    type: 'progressDrawn',
    player: seat,
    deck,
    card,
    visibleTo: [seat],
    redacted: { player: seat, deck },
  });
}

/** Draws from a deck if the player has room. Returns false when nothing was drawn. */
export function drawProgress(ctx: Ctx, seat: number, deck: Track): boolean {
  if (progressCount(ctx, seat) >= PROGRESS_HAND_LIMIT) return false;
  const card = ctx.drawCard(deck);
  if (!card) return false;
  giveProgress(ctx, seat, deck, card);
  return true;
}

/** Seats in turn order starting with the active player. */
export function turnOrder(ctx: Ctx): number[] {
  const n = ctx.playerCount;
  return Array.from({ length: n }, (_, i) => (ctx.active + i) % n);
}

/** A gate on the event die: everyone whose level in that track covers the red die draws. */
export function gateDraws(ctx: Ctx, track: Track, red: number): void {
  for (const seat of turnOrder(ctx)) {
    const level = levels(ctx, seat)[track];
    if (level < 1 || red > level + 1) continue;
    drawProgress(ctx, seat, track);
  }
}

// ---- Barbarians ----

export function barbarianTrack(ctx: Ctx): number {
  return ctx.setting<number>('barbarianTrack') ?? 7;
}

export function barbarianStrength(ctx: Ctx): number {
  return ctx.state.players.reduce((s, p) => s + citiesOf(ctx, p.seat).length, 0);
}

export function defenseStrength(ctx: Ctx): number {
  return ctx.state.players.reduce((s, p) => s + strength(ctx, p.seat), 0);
}

export function attack(ctx: Ctx): void {
  const d = ckData(ctx);
  const seats = ctx.state.players.map((p) => p.seat);
  const cities = barbarianStrength(ctx);
  const strengths = seats.map((s) => strength(ctx, s));
  const knights = strengths.reduce((a, b) => a + b, 0);
  d.attacks += 1;
  d.barbarian = 0;
  const won = knights >= cities;
  ctx.emit({ type: 'barbarianAttack', cities, knights, strengths, defended: won });

  if (!won) {
    const exposed = seats.filter((s) => freeCities(ctx, s).length > 0);
    if (exposed.length) {
      const weakest = Math.min(...exposed.map((s) => strengths[s] as number));
      for (const s of exposed.filter((x) => strengths[x] === weakest)) {
        const open = freeCities(ctx, s);
        if (open.length === 1) pillage(ctx, open[0] as Piece);
        else d.pendingLoss.push(s);
      }
    }
  } else if (knights > 0) {
    const best = Math.max(...strengths);
    const leaders = seats.filter((s) => strengths[s] === best);
    const given = Object.values(d.defender).reduce((a, b) => a + b, 0);
    if (leaders.length === 1 && given < DEFENDER_CARDS) {
      const s = leaders[0] as number;
      d.defender[s] = (d.defender[s] ?? 0) + 1;
      ctx.emit({ type: 'defender', player: s });
    } else if (leaders.length > 1) {
      for (const s of leaders)
        if (progressCount(ctx, s) < PROGRESS_HAND_LIMIT) d.pendingDefender.push(s);
    }
  }

  for (const s of seats)
    for (const k of knightsOf(ctx, s)) {
      k.props.active = false;
      delete k.props.activatedTurn;
    }
  if (!d.robberActive) {
    d.robberActive = true;
    ctx.emit({ type: 'robberWakes' });
  }
}

// ---- The roll ----

/** The roll action under ours (base, or base wrapped by Seafarers), by the wrapper we built. */
export const rollBelow = new WeakMap<ActionDef, ActionDef>();

export function rollEventDie(ctx: Ctx): EventFace {
  return EVENT_FACES[ctx.rng.int(0, EVENT_FACES.length - 1)] as EventFace;
}

export function ckDice(ctx: Ctx): DiceResult {
  const d = ckData(ctx);
  if (d.forcedRoll) return d.forcedRoll;
  const red = ctx.rng.int(1, 6);
  const yellow = ctx.rng.int(1, 6);
  const event = rollEventDie(ctx);
  return { dice: { yellow, red, event }, total: red + yellow };
}

/** Rolls all three dice and works out the event die, then production (maybe after choices). */
export function startRoll(ctx: Ctx, player: number): void {
  const d = ckData(ctx);
  const chosen = d.alchemist;
  d.alchemist = null;
  const red = chosen ? chosen.red : ctx.rng.int(1, 6);
  const yellow = chosen ? chosen.yellow : ctx.rng.int(1, 6);
  const event = rollEventDie(ctx);
  const roll: DiceResult = { dice: { yellow, red, event }, total: red + yellow };
  d.forcedRoll = roll;
  ctx.state.data.base = { ...baseData(ctx), lastRoll: roll };
  ctx.emit({ type: 'eventDie', player, face: event, red });
  if (event === 'ship') {
    d.barbarian += 1;
    ctx.emit({ type: 'barbariansAdvance', at: d.barbarian, of: barbarianTrack(ctx) });
    if (d.barbarian >= barbarianTrack(ctx)) attack(ctx);
  } else {
    gateDraws(ctx, event, red);
  }
  continueRoll(ctx);
}

/** Asks for any choices the event die left, then pays production. */
export function continueRoll(ctx: Ctx): void {
  const d = ckData(ctx);
  if (d.pendingLoss.length) {
    ctx.setPhase({ id: 'loseCity', owed: Object.fromEntries(d.pendingLoss.map((s) => [s, 1])) });
    return;
  }
  const anyDeck = TRACKS.some((t) => (ctx.state.decks[t]?.length ?? 0) > 0);
  if (!anyDeck) d.pendingDefender = [];
  if (d.pendingDefender.length) {
    ctx.setPhase({
      id: 'defenderPick',
      owed: Object.fromEntries(d.pendingDefender.map((s) => [s, 1])),
    });
    return;
  }
  finishRoll(ctx);
}

function handTotal(ctx: Ctx, seat: number): number {
  return Object.values(ctx.player(seat).hand).reduce((s, n) => s + n, 0);
}

function finishRoll(ctx: Ctx): void {
  const d = ckData(ctx);
  const below = rollBelow.get(ctx.registry.actions.roll as ActionDef);
  if (!below) throw new Error('Cities & Knights roll is not wrapped');
  const before = ctx.state.players.map((p) => handTotal(ctx, p.seat));
  below.apply(ctx, { type: 'roll', player: ctx.active });
  const total = d.forcedRoll?.total ?? 0;
  d.forcedRoll = null;

  if (total === 7) {
    if (!d.robberActive) {
      if (ctx.state.phase.id === 'moveRobber') ctx.setPhase({ id: 'main' });
      else if (ctx.state.phase.id === 'discard')
        ctx.setPhase({ ...ctx.state.phase, skipRobber: true });
    }
    return;
  }

  // Aqueduct: science level 3 players who got nothing take a resource of their choice.
  const goldOwed =
    ctx.state.phase.id === 'pickGold' ? (ctx.state.phase.owed as Record<number, number>) : {};
  const owed: Record<number, number> = {};
  for (const p of ctx.state.players) {
    if (!hasAbility(ctx, p.seat, 'science')) continue;
    if (handTotal(ctx, p.seat) > (before[p.seat] ?? 0) || goldOwed[p.seat]) continue;
    if (RESOURCES.some((r) => (ctx.state.bank[r] ?? 0) > 0)) owed[p.seat] = 1;
  }
  if (!Object.keys(owed).length) return;
  if (ctx.state.phase.id === 'pickGold') {
    const gold = ctx.state.phase;
    ctx.setPhase({ ...gold, returnTo: { id: 'aqueduct', owed, returnTo: gold.returnTo as Phase } });
  } else {
    ctx.setPhase({ id: 'aqueduct', owed, returnTo: ctx.state.phase });
  }
}

// ---- Board helpers ----

/** Hexes touching one of the player's settlements or cities. */
export function hexesNear(ctx: Ctx, seat: number): Set<HexId> {
  const out = new Set<HexId>();
  for (const p of ctx.piecesOf(seat)) {
    if (p.at.kind !== 'corner' || !ctx.registry.pieceTypes[p.type]?.building) continue;
    for (const h of ctx.geometry.cornerHexes.get(p.at.id) ?? []) out.add(h);
  }
  return out;
}

export function merchant(ctx: Ctx): Piece | undefined {
  return ctx.piecesOfType('merchant')[0];
}

export function allCommodities(): readonly string[] {
  return COMMODITIES;
}
