import type { Action, ActionDef, Cards, CornerId, Ctx, HexId, Phase } from '@colonizers/engine';
import {
  activeTracks,
  attack,
  citiesOf,
  cityAtRisk,
  ckData,
  commoditiesIn,
  drawProgress,
  freeCities,
  isActive,
  isAway,
  isSheltered,
  knightStrength,
  knightsOf,
  levels,
  pillage,
  setMetropolis,
  shielded,
  TERRAIN_COMMODITY,
  type Track,
} from '@colonizers/module-cities-knights';
import { CIV_BY_ID, READY_CIVS } from './civs.ts';
import {
  action,
  addGift,
  civData,
  civView,
  giftsOf,
  isCoastalCorner,
  lowerTrack,
  markOnce,
  onlyActive,
  owes,
  plays,
  playsLater,
  progressCheck,
  seatOf,
  takeGift,
  usedOnce,
  type Gift,
} from './core.ts';
import { unlockGifts } from './effects.ts';
import { ethiopiaDefense } from './part3.ts';
import { placeNeutral, startCards, startGifts } from './setup.ts';

/**
 * Civilisations, part 4: Spain, Britain, Nordic, Poland, Cuba, the Ottomans
 * and the Aztecs.
 */

const giftAt = (ctx: Ctx, seat: number, kind: Gift['kind']) =>
  giftsOf(ctx, seat).findIndex((g) => g.kind === kind);

const inBank = (ctx: Ctx, card: string, n: number) => Math.min(n, ctx.state.bank[card] ?? 0);

// ---- Aztec: Capital Tenochtitlán ----

/** Hexes beside the Aztec starting city that bring something. */
export function capitalHexes(ctx: Ctx, seat: number): HexId[] {
  const g = giftsOf(ctx, seat).find((x) => x.kind === 'capital');
  if (!g || g.kind !== 'capital') return [];
  return (ctx.geometry.cornerHexes.get(g.corner) ?? []).filter((h) => {
    const x = ctx.state.hexes[h];
    return !!x && !x.hidden && !!ctx.registry.hexTypes[x.type]?.produces;
  });
}

const civCapital = action<{ hex: HexId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return capitalHexes(ctx, a.player).includes(a.hex)
      ? null
      : 'Pick a hex beside your starting city';
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftAt(ctx, a.player, 'capital'));
    const type = ctx.state.hexes[a.hex]!.type;
    const got: Cards = {};
    const res = ctx.registry.hexTypes[type]?.produces;
    if (res) got[res] = inBank(ctx, res, 2);
    const com = TERRAIN_COMMODITY[type];
    if (com && commoditiesIn(ctx).includes(com)) got[com] = inBank(ctx, com, 2);
    for (const [c, n] of Object.entries(got)) if (!n) delete got[c];
    ctx.grant(a.player, got);
    ctx.emit({ type: 'civCapital', player: a.player, hex: a.hex, cards: got });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return capitalHexes(ctx, player).map((hex) => ({ type: 'civCapital', player, hex }));
  },
});

// ---- Aztec: Legend of the Five Suns ----

/** Settlements a free city could go on. */
export function upgradeTargets(ctx: Ctx, seat: number): CornerId[] {
  if (giftAt(ctx, seat, 'city') < 0 || ctx.supplyLeft(seat, 'city') <= 0) return [];
  return ctx.piecesOf(seat, 'settlement').flatMap((p) => (p.at.kind === 'corner' ? [p.at.id] : []));
}

const civUpgrade = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (giftAt(ctx, a.player, 'city') < 0) return 'You have no free city';
    return upgradeTargets(ctx, a.player).includes(a.corner) ? null : 'Pick one of your settlements';
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftAt(ctx, a.player, 'city'));
    ctx.upgrade(ctx.buildingAt(a.corner)!, 'city');
    ctx.emit({ type: 'built', player: a.player, piece: 'city', at: a.corner, free: true });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return upgradeTargets(ctx, player).map((corner) => ({ type: 'civUpgrade', player, corner }));
  },
});

function fiveSuns(ctx: Ctx): void {
  const seat = seatOf(ctx, 'aztec');
  if (seat === null || !playsLater(ctx, seat, 'aztec') || usedOnce(ctx, seat, 'suns')) return;
  if (ctx.supplyLeft(seat, 'settlement') > 0) return;
  markOnce(ctx, seat, 'suns');
  ctx.emit({ type: 'civFiveSuns', player: seat });
  addGift(ctx, seat, { kind: 'city' });
  for (let i = 0; i < 3; i++) addGift(ctx, seat, { kind: 'progress' });
}

// ---- Poland: Winged Hussars ----

/** A rival's road or ship on the hex's edges, or basic knight on its corners. */
export function hussarTargets(ctx: Ctx, seat: number, hex: HexId): string[] {
  const out: string[] = [];
  const rival = (p: { owner: number | null }) => p.owner !== null && p.owner !== seat;
  for (const e of ctx.geometry.hexEdges.get(hex) ?? [])
    if (
      ctx
        .piecesAt({ kind: 'edge', id: e })
        .some((p) => rival(p) && !!ctx.registry.pieceTypes[p.type]?.route && !shielded(ctx, p))
    )
      out.push(e);
  for (const c of ctx.geometry.hexCorners.get(hex) ?? [])
    if (
      ctx
        .piecesAt({ kind: 'corner', id: c })
        .some((p) => rival(p) && p.type === 'knight1' && !shielded(ctx, p))
    )
      out.push(c);
  return out;
}

const hussarGift = (ctx: Ctx, seat: number, at: string) =>
  giftsOf(ctx, seat).findIndex(
    (g) => g.kind === 'hussar' && hussarTargets(ctx, seat, g.hex).includes(at),
  );

/** Every target the player's hussar gifts reach. */
export function hussarSpots(ctx: Ctx, seat: number): string[] {
  return [
    ...new Set(
      giftsOf(ctx, seat).flatMap((g) =>
        g.kind === 'hussar' ? hussarTargets(ctx, seat, g.hex) : [],
      ),
    ),
  ];
}

const civHussar = action<{ at: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return hussarGift(ctx, a.player, a.at) >= 0
      ? null
      : "Pick a rival's road, ship or basic knight beside the robber";
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, hussarGift(ctx, a.player, a.at));
    const edge = ctx.geometry.edges.includes(a.at as never);
    const piece = ctx
      .piecesAt({ kind: edge ? 'edge' : 'corner', id: a.at } as never)
      .find((p) => p.owner !== null && p.owner !== a.player && (edge || p.type === 'knight1'))!;
    const victim = piece.owner as number;
    ctx.remove(piece);
    ctx.emit({ type: 'civHussar', player: a.player, victim, piece: piece.type, at: a.at });
    if (piece.type === 'knight1') addGift(ctx, a.player, { kind: 'knight', level: 1 });
    else addGift(ctx, a.player, { kind: 'route', only: piece.type === 'ship' ? 'ship' : 'road' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return hussarSpots(ctx, player).map((at) => ({ type: 'civHussar', player, at }));
  },
});

/** The hussars ride only on the turn the robber moved. */
export function dropHussars(ctx: Ctx): void {
  const gifts = civView(ctx).gifts?.[ctx.active];
  if (gifts?.some((g) => g.kind === 'hussar'))
    civData(ctx).gifts[ctx.active] = gifts.filter((g) => g.kind !== 'hussar');
}

// ---- Poland: Polish-Lithuanian Union ----

/** The player with the most points, other than this one (the first in seat order on a tie). */
export function unionLeader(ctx: Ctx, seat: number): number | null {
  let best: number | null = null;
  for (const p of ctx.state.players) {
    if (p.seat === seat) continue;
    if (best === null || ctx.vp(p.seat) > ctx.vp(best)) best = p.seat;
  }
  return best;
}

const civUnion = action<object>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!playsLater(ctx, a.player, 'poland')) return 'Only Poland, from 10 points';
    if (usedOnce(ctx, a.player, 'union')) return 'Once a game';
    return unionLeader(ctx, a.player) === null ? 'Nobody to join' : null;
  },
  apply(ctx, a) {
    markOnce(ctx, a.player, 'union');
    const leader = unionLeader(ctx, a.player)!;
    civData(ctx).union = {
      seat: a.player,
      leader,
      until: ctx.state.turn.number + ctx.playerCount,
    };
    ctx.emit({ type: 'civUnion', player: a.player, leader });
  },
  enumerate(ctx, player) {
    if (
      player !== ctx.active ||
      !playsLater(ctx, player, 'poland') ||
      usedOnce(ctx, player, 'union') ||
      unionLeader(ctx, player) === null
    )
      return [];
    return [{ type: 'civUnion', player }];
  },
});

function union(ctx: Ctx): void {
  const u = civView(ctx).union;
  if (!u || ctx.state.turn.number >= u.until) return;
  let drew = false;
  for (const e of [...ctx.events]) {
    if (e.type === 'production') {
      const got = (e.received as Record<number, Cards> | undefined)?.[u.leader] ?? {};
      const copy: Cards = {};
      for (const [card, n] of Object.entries(got)) {
        const m = inBank(ctx, card, n);
        if (m > 0) copy[card] = m;
      }
      if (Object.keys(copy).length) {
        ctx.grant(u.seat, copy);
        ctx.emit({ type: 'civUnionShare', player: u.seat, cards: copy });
      }
    }
    if (
      e.type === 'progressDrawn' &&
      e.player === u.leader &&
      drawProgress(ctx, u.seat, e.deck as Track)
    ) {
      drew = true;
      ctx.emit({ type: 'civUnionShare', player: u.seat, deck: e.deck });
    }
  }
  if (drew) progressCheck(ctx);
}

// ---- Nordic: Ivar the Boneless and Thor's Hammer; Ottoman: the Great Bombard ----

const forced = (ctx: Ctx) => civView(ctx).forced === 'barbarians';

/** Nordic's knights sail with the barbarians, and Nordic's cities don't count. */
export function civBarbarians(ctx: Ctx, value: number): number {
  let v = value;
  const n = seatOf(ctx, 'nordic');
  if (n !== null) {
    v -= citiesOf(ctx, n).filter((c) => !isSheltered(ctx, c)).length;
    v += knightsOf(ctx, n)
      .filter((k) => isActive(k) && !isAway(k) && !isSheltered(ctx, k))
      .reduce((s, k) => s + knightStrength(ctx, k), 0);
  }
  return forced(ctx) ? Math.max(v, 1) : v;
}

/** Nordic doesn't defend Catan; nobody does against Thor's Hammer. */
export function civDefense(ctx: Ctx, seat: number, value: number): number {
  if (forced(ctx) || plays(ctx, seat, 'nordic')) return 0;
  return ethiopiaDefense(ctx, seat, value);
}

/** The barbarians don't take Nordic's or Britain's cities. */
export const civBarbarianSafe = (ctx: Ctx, seat: number, value: boolean): boolean =>
  value || plays(ctx, seat, 'nordic') || plays(ctx, seat, 'britain');

/** When Catan beats the barbarians, Nordic loses a city. */
export function civBarbarianLosses(ctx: Ctx, defended: boolean, value: number[]): number[] {
  const n = seatOf(ctx, 'nordic');
  if (n === null || !defended || value.includes(n)) return value;
  return [...value, n];
}

/** Nordic's points from barbarian wins. */
export const civVp = (ctx: Ctx, seat: number, value: number): number =>
  value + (civView(ctx).raids?.[seat] ?? 0);

/** Rival cities Nordic may turn back into settlements. */
export function razeTargets(ctx: Ctx, seat: number): CornerId[] {
  if (giftAt(ctx, seat, 'raze') < 0) return [];
  return ctx.state.players.flatMap((p) =>
    p.seat === seat
      ? []
      : cityAtRisk(ctx, p.seat).flatMap((c) => (c.at.kind === 'corner' ? [c.at.id] : [])),
  );
}

function barbarianWins(ctx: Ctx): void {
  for (const e of ctx.events) {
    if (e.type !== 'barbarianAttack' || e.defended !== false) continue;
    const n = seatOf(ctx, 'nordic');
    if (n === null) continue;
    const d = civData(ctx);
    (d.raids ??= {})[n] = (d.raids[n] ?? 0) + 1;
    ctx.emit({ type: 'civRaid', player: n });
    addGift(ctx, n, { kind: 'raze' });
    if (!razeTargets(ctx, n).length) takeGift(ctx, n, giftAt(ctx, n, 'raze'));
  }
}

const civRaze = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return razeTargets(ctx, a.player).includes(a.corner)
      ? null
      : "Pick a rival's city without a metropolis";
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftAt(ctx, a.player, 'raze'));
    const city = ctx.buildingAt(a.corner)!;
    const victim = city.owner as number;
    pillage(ctx, city);
    ctx.emit({ type: 'civRaze', player: a.player, victim, at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return razeTargets(ctx, player).map((corner) => ({ type: 'civRaze', player, corner }));
  },
});

const civThor = action<object>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!playsLater(ctx, a.player, 'nordic')) return 'Only Nordic, from 10 points';
    return usedOnce(ctx, a.player, 'thor') ? 'Once a game' : null;
  },
  apply(ctx, a) {
    markOnce(ctx, a.player, 'thor');
    ctx.emit({ type: 'civThor', player: a.player });
    // Knights are ignored: they stay as they are.
    const awake = ctx.state.players.flatMap((p) =>
      knightsOf(ctx, p.seat)
        .filter(isActive)
        .map((k) => ({ k, turn: k.props.activatedTurn })),
    );
    civData(ctx).forced = 'barbarians';
    try {
      attack(ctx);
    } finally {
      civData(ctx).forced = null;
    }
    for (const { k, turn } of awake) {
      k.props.active = true;
      if (turn !== undefined) k.props.activatedTurn = turn;
    }
    const d = ckData(ctx);
    d.pendingDefender = [];
    if (d.pendingLoss.length)
      ctx.setPhase({
        id: 'civRaid',
        owed: Object.fromEntries(d.pendingLoss.map((s) => [s, 1])),
        returnTo: ctx.state.phase,
      });
  },
  enumerate(ctx, player) {
    if (
      player !== ctx.active ||
      !playsLater(ctx, player, 'nordic') ||
      usedOnce(ctx, player, 'thor')
    )
      return [];
    return [{ type: 'civThor', player }];
  },
});

/** After Thor's Hammer: each player hit picks the city they lose. */
const civRaidCity = action<{ corner: CornerId }>({
  phases: ['civRaid'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'You do not lose a city';
    const b = ctx.buildingAt(a.corner);
    return b && cityAtRisk(ctx, a.player).includes(b)
      ? null
      : 'Pick one of your cities without a metropolis';
  },
  apply(ctx, a) {
    pillage(ctx, ctx.buildingAt(a.corner)!);
    const d = ckData(ctx);
    d.pendingLoss = d.pendingLoss.filter((s) => s !== a.player);
    const ph = ctx.state.phase;
    const owed = ph.owed as Record<number, number>;
    delete owed[a.player];
    if (!Object.keys(owed).length) ctx.setPhase(ph.returnTo as Phase);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return cityAtRisk(ctx, player).flatMap((c) =>
      c.at.kind === 'corner' ? [{ type: 'civRaidCity', player, corner: c.at.id }] : [],
    );
  },
});

const civBombard = action<object>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!playsLater(ctx, a.player, 'ottoman')) return 'Only the Ottomans, from 10 points';
    if (usedOnce(ctx, a.player, 'bombard')) return 'Once a game';
    return ckData(ctx).barbarian > 0 ? null : 'The barbarian ship has not set sail';
  },
  apply(ctx, a) {
    markOnce(ctx, a.player, 'bombard');
    const d = ckData(ctx);
    d.barbarian = 0;
    ctx.emit({ type: 'civBombard', player: a.player });
    if (!d.robberActive) {
      d.robberActive = true;
      ctx.emit({ type: 'robberWakes' });
    }
  },
  enumerate(ctx, player) {
    if (
      player !== ctx.active ||
      !playsLater(ctx, player, 'ottoman') ||
      usedOnce(ctx, player, 'bombard') ||
      ckData(ctx).barbarian <= 0
    )
      return [];
    return [{ type: 'civBombard', player }];
  },
});

// ---- Cuba ----

const civCommodity = action<{ card: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (giftAt(ctx, a.player, 'commodity') < 0) return 'You have no commodity to take';
    if (!commoditiesIn(ctx).includes(a.card)) return 'Pick a commodity';
    return ctx.bankHas({ [a.card]: 1 }) ? null : 'The bank has none left';
  },
  apply(ctx, a) {
    takeGift(ctx, a.player, giftAt(ctx, a.player, 'commodity'));
    ctx.grant(a.player, { [a.card]: 1 });
    ctx.emit({ type: 'civGain', player: a.player, card: a.card, why: 'Spanish Caribbean' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || giftAt(ctx, player, 'commodity') < 0) return [];
    return commoditiesIn(ctx)
      .filter((card) => ctx.bankHas({ [card]: 1 }))
      .map((card) => ({ type: 'civCommodity', player, card }));
  },
});

function caribbean(ctx: Ctx): void {
  if (!civView(ctx).started) return;
  for (const e of ctx.events) {
    if (e.type !== 'built' || e.piece !== 'settlement') continue;
    const seat = e.player as number;
    if (!plays(ctx, seat, 'cuba') || !isCoastalCorner(ctx, e.at as CornerId)) continue;
    const d = civData(ctx);
    const n = (d.cubaCoast ??= {})[seat] ? 1 : 2;
    d.cubaCoast[seat] = true;
    for (let i = 0; i < n; i++) {
      addGift(ctx, seat, { kind: 'progress' });
      addGift(ctx, seat, { kind: 'commodity' });
    }
    ctx.emit({ type: 'civCaribbean', player: seat, count: n });
  }
}

/** The first other player to reach the winning points hands Cuba their metropolises. */
function victoria(ctx: Ctx): void {
  const cuba = seatOf(ctx, 'cuba');
  if (cuba === null || !playsLater(ctx, cuba, 'cuba') || usedOnce(ctx, cuba, 'victoria')) return;
  const target = ctx.vpTarget();
  const rival = ctx.state.players.find((p) => p.seat !== cuba && ctx.vp(p.seat) >= target)?.seat;
  if (rival === undefined) return;
  markOnce(ctx, cuba, 'victoria');
  const d = ckData(ctx);
  const tracks: Track[] = [];
  for (const t of activeTracks(ctx)) {
    if (d.metropolis[t]?.seat !== rival) continue;
    tracks.push(t);
    const home = freeCities(ctx, cuba)[0];
    if (home) setMetropolis(ctx, cuba, t, home);
    while (levels(ctx, rival)[t] > levels(ctx, cuba)[t]) lowerTrack(ctx, rival, t);
  }
  ctx.emit({ type: 'civVictoria', player: cuba, from: rival, tracks });
}

// ---- Britain and Spain: a new civilisation ----

const AMERICAS = ['granColombia', 'maya', 'inca', 'aztec', 'cuba'];
const NO_COLONY = ['britain', 'spain'];

function freeCivs(ctx: Ctx, seat: number, from: readonly string[]): string[] {
  const d = civView(ctx);
  const taken = new Set(Object.values(d.civ ?? {}));
  return from.filter((c) => !taken.has(c) && !NO_COLONY.includes(c) && CIV_BY_ID[c]?.ready);
}

/** Britain draws three civilisations, Spain one from the Americas. */
export function startColony(ctx: Ctx, seat: number): void {
  const spain = plays(ctx, seat, 'spain');
  const pool = ctx.rng.shuffle(freeCivs(ctx, seat, spain ? AMERICAS : READY_CIVS));
  const options = pool.slice(0, spain ? 1 : 3);
  if (!options.length) return;
  ctx.emit({ type: 'civColonyDrawn', player: seat, options });
  ctx.setPhase({
    id: 'civColony',
    owed: { [seat]: 1 },
    options,
    redraw: spain && pool.length > 1,
    returnTo: ctx.state.phase,
  });
}

/** Plays a new civilisation from now on: its start and 10-point gifts come with it. */
function switchCiv(ctx: Ctx, seat: number, id: string, returnTo: Phase): void {
  const d = civData(ctx);
  const from = d.civ[seat];
  d.civ[seat] = id;
  ctx.emit({ type: 'civSwitched', player: seat, from, civ: id });
  ctx.setPhase(returnTo);
  const neutral = startCards(ctx, seat);
  startGifts(ctx, seat);
  unlockGifts(ctx, seat);
  if (neutral) placeNeutral(ctx, [seat], ctx.state.phase);
  else progressCheck(ctx);
}

const civColony = action<{ civ: string }>({
  phases: ['civColony'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not your choice';
    const ph = ctx.state.phase;
    if (a.civ === 'redraw') return ph.redraw ? null : 'You can not draw again';
    return (ph.options as string[]).includes(a.civ) ? null : 'Pick one of the drawn civilisations';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    if (a.civ === 'redraw') {
      const old = ph.options as string[];
      const pool = ctx.rng.shuffle(
        freeCivs(ctx, a.player, AMERICAS).filter((c) => !old.includes(c)),
      );
      ph.redraw = false;
      if (pool[0]) ph.options = [pool[0]];
      ctx.emit({ type: 'civColonyDrawn', player: a.player, options: ph.options, redraw: true });
      return;
    }
    switchCiv(ctx, a.player, a.civ, ph.returnTo as Phase);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    const ph = ctx.state.phase;
    const out: Action[] = (ph.options as string[]).map((civ) => ({
      type: 'civColony',
      player,
      civ,
    }));
    if (ph.redraw) out.push({ type: 'civColony', player, civ: 'redraw' });
    return out;
  },
});

// ---- Effects ----

export function part4Effects(ctx: Ctx): void {
  for (const e of ctx.events) {
    // Poland: moving the robber lets the hussars ride.
    if (e.type === 'robberMoved' && plays(ctx, e.player as number, 'poland')) {
      const seat = e.player as number;
      const hex = e.hex as HexId;
      if (hussarTargets(ctx, seat, hex).length) {
        civData(ctx).gifts[seat] = giftsOf(ctx, seat).filter((g) => g.kind !== 'hussar');
        addGift(ctx, seat, { kind: 'hussar', hex });
      }
    }
  }
  barbarianWins(ctx);
  union(ctx);
  caribbean(ctx);
  fiveSuns(ctx);
  victoria(ctx);
}

export const part4Actions: Record<string, ActionDef> = {
  civCapital,
  civUpgrade,
  civHussar,
  civUnion,
  civRaze,
  civThor,
  civRaidCity,
  civBombard,
  civCommodity,
  civColony,
};
