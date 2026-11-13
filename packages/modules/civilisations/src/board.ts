import type { ActionDef, CornerId, Ctx, HexId, Phase } from '@colonizers/engine';
import { robber, robberHexes } from '@colonizers/module-base';
import {
  activeTracks,
  drawProgress,
  giveProgress,
  knightAt,
  knightLevel,
  type Track,
} from '@colonizers/module-cities-knights';
import { builtWonders } from '@colonizers/module-world-wonders';
import {
  action,
  addGift,
  civData,
  civView,
  isLandHex,
  isSeaHex,
  markOnce,
  onlyActive,
  owes,
  plays,
  playsLater,
  progressCheck,
  seatOf,
  usedOnce,
} from './core.ts';

/**
 * Abilities that change the board, the robber or the decks, each a button:
 * France's number swap and revolution, the Inca's Lago Titicaca, China's
 * Great Leap, Mongolia's extra robber, Russia's robber for the player before
 * them, and Austria's Habsburg Marriage.
 */

// ---- France ----

const robberHex = (ctx: Ctx): HexId | null => {
  const at = robber(ctx)?.at;
  return at?.kind === 'hex' ? at.id : null;
};

/** Hexes whose number can swap with the robber's (France). */
export function gallicHexes(ctx: Ctx): HexId[] {
  const from = robberHex(ctx);
  if (!from || ctx.state.hexes[from]?.token === undefined) return [];
  return ctx.geometry.hexes.filter((h) => {
    const x = ctx.state.hexes[h];
    return (
      h !== from &&
      !!x &&
      !x.hidden &&
      x.token !== undefined &&
      x.token !== ctx.state.hexes[from]?.token
    );
  });
}

const civGallic = action<{ hex: HexId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!plays(ctx, a.player, 'france')) return 'Only France can do that';
    if (usedOnce(ctx, a.player, 'gallic')) return 'Once a game';
    return gallicHexes(ctx).includes(a.hex) ? null : 'Pick another hex with a number';
  },
  apply(ctx, a) {
    markOnce(ctx, a.player, 'gallic');
    const from = ctx.state.hexes[robberHex(ctx)!]!;
    const to = ctx.state.hexes[a.hex]!;
    const t = from.token;
    from.token = to.token as number;
    to.token = t as number;
    ctx.emit({
      type: 'civGallic',
      player: a.player,
      from: from.id,
      to: to.id,
      tokens: [to.token, from.token],
    });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !plays(ctx, player, 'france') || usedOnce(ctx, player, 'gallic'))
      return [];
    return gallicHexes(ctx).map((hex) => ({ type: 'civGallic', player, hex }));
  },
});

/** Rival strong knights France can bring down. */
export function revolutionTargets(ctx: Ctx, seat: number): CornerId[] {
  return ctx.geometry.corners.filter((c) => {
    const k = knightAt(ctx, c);
    return !!k && k.owner !== null && k.owner !== seat && knightLevel(k) === 2;
  });
}

const civRevolution = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!playsLater(ctx, a.player, 'france')) return 'Only France, from 10 points';
    if (usedOnce(ctx, a.player, 'revolution')) return 'Once a game';
    return revolutionTargets(ctx, a.player).includes(a.corner)
      ? null
      : "Pick a rival's strong knight";
  },
  apply(ctx, a) {
    markOnce(ctx, a.player, 'revolution');
    const k = knightAt(ctx, a.corner)!;
    const owner = k.owner;
    ctx.remove(k);
    ctx.emit({ type: 'civRevolution', player: a.player, victim: owner, at: a.corner });
    addGift(ctx, a.player, { kind: 'settlement', where: 'any' });
  },
  enumerate(ctx, player) {
    if (
      player !== ctx.active ||
      !playsLater(ctx, player, 'france') ||
      usedOnce(ctx, player, 'revolution')
    )
      return [];
    return revolutionTargets(ctx, player).map((corner) => ({
      type: 'civRevolution',
      player,
      corner,
    }));
  },
});

// ---- Inca: Lago Titicaca ----

const wonderHexes = (ctx: Ctx): Set<HexId> =>
  new Set(Object.values(builtWonders(ctx)).map((w) => w.hex));

/** Land hexes with land all round, that may swap places with the sea. */
export function titicacaLand(ctx: Ctx): HexId[] {
  const wonders = wonderHexes(ctx);
  return ctx.geometry.hexes.filter((h) => {
    if (!isLandHex(ctx, h) || ctx.state.hexes[h]?.hidden || wonders.has(h)) return false;
    const around = ctx.geometry.hexNeighbours.get(h) ?? [];
    return around.length === 6 && around.every((n) => isLandHex(ctx, n));
  });
}

/** Open sea hexes: nothing on them, no harbor, ship or road along them. */
export function titicacaSea(ctx: Ctx): HexId[] {
  const harbors = new Set(ctx.state.harbors.map((h) => h.edge));
  return ctx.geometry.hexes.filter((h) => {
    if (!isSeaHex(ctx, h) || ctx.state.hexes[h]?.hidden) return false;
    if (ctx.piecesAt({ kind: 'hex', id: h }).length) return false;
    return (ctx.geometry.hexEdges.get(h) ?? []).every(
      (e) => !harbors.has(e) && !ctx.piecesAt({ kind: 'edge', id: e }).length,
    );
  });
}

const civTiticaca = action<{ land: HexId; sea: HexId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!playsLater(ctx, a.player, 'inca')) return 'Only the Inca, from 10 points';
    if (usedOnce(ctx, a.player, 'titicaca')) return 'Once a game';
    if (!titicacaLand(ctx).includes(a.land)) return 'Pick a land hex with land all round';
    return titicacaSea(ctx).includes(a.sea) ? null : 'Pick an open sea hex';
  },
  apply(ctx, a) {
    markOnce(ctx, a.player, 'titicaca');
    const land = ctx.state.hexes[a.land]!;
    const sea = ctx.state.hexes[a.sea]!;
    const moving = { type: land.type, token: land.token, props: land.props };
    land.type = sea.type;
    delete land.token;
    if (sea.props) land.props = sea.props;
    else delete land.props;
    sea.type = moving.type;
    if (moving.token !== undefined) sea.token = moving.token;
    if (moving.props) sea.props = moving.props;
    else delete sea.props;
    for (const p of ctx.piecesAt({ kind: 'hex', id: a.land }))
      ctx.move(p, { kind: 'hex', id: a.sea });
    ctx.emit({ type: 'civTiticaca', player: a.player, land: a.land, sea: a.sea });
  },
  enumerate(ctx, player) {
    if (
      player !== ctx.active ||
      !playsLater(ctx, player, 'inca') ||
      usedOnce(ctx, player, 'titicaca')
    )
      return [];
    const seas = titicacaSea(ctx);
    return titicacaLand(ctx).flatMap((land) =>
      seas.map((sea) => ({ type: 'civTiticaca', player, land, sea })),
    );
  },
});

// ---- China: Great Leap Forward ----

/** The five colours of progress card, without Wealth's gold. */
const LEAP_DECKS: Track[] = ['science', 'trade', 'politics', 'magic', 'religion'];

export function leapCities(ctx: Ctx, seat: number): CornerId[] {
  if (ctx.supplyLeft(seat, 'settlement') <= 0) return [];
  return ctx
    .piecesOf(seat, 'city')
    .filter((c) => !c.props.metropolis && c.at.kind === 'corner')
    .map((c) => (c.at as { id: CornerId }).id);
}

const civLeap = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!playsLater(ctx, a.player, 'china')) return 'Only China, from 10 points';
    if (usedOnce(ctx, a.player, 'leap')) return 'Once a game';
    return leapCities(ctx, a.player).includes(a.corner) ? null : 'Pick one of your cities';
  },
  apply(ctx, a) {
    markOnce(ctx, a.player, 'leap');
    const city = ctx.buildingAt(a.corner)!;
    const s = ctx.upgrade(city, 'settlement');
    delete s.props.wall;
    ctx.emit({ type: 'civLeap', player: a.player, at: a.corner });
    const active = activeTracks(ctx);
    for (const deck of LEAP_DECKS) if (active.includes(deck)) drawProgress(ctx, a.player, deck);
    progressCheck(ctx);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !playsLater(ctx, player, 'china') || usedOnce(ctx, player, 'leap'))
      return [];
    return leapCities(ctx, player).map((corner) => ({ type: 'civLeap', player, corner }));
  },
});

// ---- Mongolia: the robber on a 3 or 11 ----

const civKhagan = action<object>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return civView(ctx).khagan === ctx.state.turn.number && plays(ctx, a.player, 'mongolia')
      ? null
      : 'Only after you roll a 3 or 11';
  },
  apply(ctx, a) {
    delete civData(ctx).khagan;
    ctx.emit({ type: 'civKhagan', player: a.player });
    ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
  },
  enumerate: (ctx, player) => [{ type: 'civKhagan', player }],
});

/** Mongolia robs a progress card too, when they rob with the robber. */
export function khaganSpoils(ctx: Ctx, victim: number, thief: number): void {
  const held = activeTracks(ctx).flatMap((deck) =>
    (ctx.player(victim).held[deck] ?? []).map((_, i) => ({ deck, i })),
  );
  if (!held.length) return;
  const { deck, i } = held[ctx.rng.int(0, held.length - 1)]!;
  const [card] = ctx.player(victim).held[deck]!.splice(i, 1);
  if (!card) return;
  (ctx.player(thief).held[deck] ??= []).push({
    card: card.card,
    acquiredTurn: ctx.state.turn.number,
  });
  ctx.emit({
    type: 'civSpoils',
    player: thief,
    from: victim,
    card: card.card,
    visibleTo: [thief, victim],
    redacted: { player: thief, from: victim },
  });
  progressCheck(ctx);
}

// ---- Russia: the robber for the player before you ----

/** Seat of Russia, if the active player is the one before them. */
export function muscovySeat(ctx: Ctx): number | null {
  const russia = seatOf(ctx, 'russia');
  if (russia === null || russia === ctx.active) return null;
  return (ctx.active + 1) % ctx.playerCount === russia ? russia : null;
}

/** After a 7 by the player before Russia, Russia may throw the dice for the robber. */
export function startMuscovy(ctx: Ctx): void {
  const ph = ctx.state.phase;
  if (
    ph.id !== 'moveRobber' ||
    !ctx.events.some((e) => e.type === 'phase' && e.to === 'moveRobber')
  )
    return;
  const lastRoll = (ctx.state.data.base as { lastRoll?: { total?: number } } | undefined)?.lastRoll;
  if (lastRoll?.total !== 7) return;
  const russia = muscovySeat(ctx);
  const d = civData(ctx);
  if (russia === null || d.muscovy === ctx.state.turn.number) return;
  d.muscovy = ctx.state.turn.number;
  ctx.setPhase({ id: 'civMuscovy', owed: { [russia]: 1 }, returnTo: ph });
}

/** Hexes the roller could move the robber to. */
function robberOptions(ctx: Ctx, returnTo: Phase): HexId[] {
  const move = ctx.registry.actions.moveRobber!;
  const now = ctx.state.phase;
  ctx.state.phase = returnTo;
  try {
    return robberHexes(ctx).filter(
      (hex) => move.check(ctx, { type: 'moveRobber', player: ctx.active, hex }) === null,
    );
  } finally {
    ctx.state.phase = now;
  }
}

const civMuscovy = action<{ use: boolean }>({
  phases: ['civMuscovy'],
  check: (ctx, a) => (owes(ctx, a.player) ? null : 'Not yours to throw'),
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const returnTo = ph.returnTo as Phase;
    if (!a.use) {
      ctx.setPhase(returnTo);
      return;
    }
    const a1 = ctx.rng.int(1, 6);
    const a2 = ctx.rng.int(1, 6);
    const total = a1 + a2;
    const all = robberOptions(ctx, returnTo);
    const hexes = total === 7 ? all : all.filter((h) => ctx.state.hexes[h]?.token === total);
    ctx.emit({
      type: 'civMuscovyRoll',
      player: a.player,
      dice: [a1, a2],
      total,
      hexes: hexes.length,
    });
    if (!hexes.length) {
      ctx.setPhase(returnTo);
      return;
    }
    ctx.setPhase({ id: 'civMuscovyHex', owed: { [a.player]: 1 }, hexes, total, returnTo });
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return [
      { type: 'civMuscovy', player, use: true },
      { type: 'civMuscovy', player, use: false },
    ];
  },
});

const civMuscovyHex = action<{ hex: HexId }>({
  phases: ['civMuscovyHex'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not yours to place';
    return (ctx.state.phase.hexes as HexId[]).includes(a.hex) ? null : 'Pick one of those hexes';
  },
  apply(ctx, a) {
    ctx.setPhase(ctx.state.phase.returnTo as Phase);
    ctx.emit({ type: 'civMuscovyHex', player: a.player, hex: a.hex });
    ctx.registry.actions.moveRobber!.apply(ctx, {
      type: 'moveRobber',
      player: ctx.active,
      hex: a.hex,
    });
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return (ctx.state.phase.hexes as HexId[]).map((hex) => ({
      type: 'civMuscovyHex',
      player,
      hex,
    }));
  },
});

// ---- Austria: Habsburg Marriage ----

export interface Drawn {
  card: string;
  deck: Track;
}

const civHabsburg = action<{ deck: Track }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!playsLater(ctx, a.player, 'austria')) return 'Only Austria-Hungary, from 10 points';
    if (usedOnce(ctx, a.player, 'habsburg')) return 'Once a game';
    return activeTracks(ctx).includes(a.deck) && ctx.state.decks[a.deck]?.length
      ? null
      : 'Pick a deck with cards in it';
  },
  apply(ctx, a) {
    markOnce(ctx, a.player, 'habsburg');
    const drawn: Drawn[] = [];
    const take = (deck: Track) => {
      const card = ctx.drawCard(deck);
      if (card) drawn.push({ card, deck });
    };
    for (const deck of activeTracks(ctx)) take(deck);
    take(a.deck);
    take(a.deck);
    ctx.emit({ type: 'civHabsburg', player: a.player, deck: a.deck, count: drawn.length });
    if (drawn.length <= HABSBURG_KEEP) {
      for (const d of drawn) giveProgress(ctx, a.player, d.deck, d.card);
      progressCheck(ctx);
      return;
    }
    civData(ctx).habsburg = { seat: a.player, drawn };
    ctx.setPhase({
      id: 'civHabsburg',
      owed: { [a.player]: 1 },
      count: drawn.length,
      returnTo: ctx.state.phase,
    });
  },
  enumerate(ctx, player) {
    if (
      player !== ctx.active ||
      !playsLater(ctx, player, 'austria') ||
      usedOnce(ctx, player, 'habsburg')
    )
      return [];
    return activeTracks(ctx)
      .filter((deck) => ctx.state.decks[deck]?.length)
      .map((deck) => ({ type: 'civHabsburg', player, deck }));
  },
});

const HABSBURG_KEEP = 3;

/** Every way to keep 3 of the drawn cards, by index. */
function keepSets(n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) out.push([i, j, k]);
  return out;
}

const civHabsburgKeep = action<{ keep: number[] }>({
  phases: ['civHabsburg'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not yours to keep';
    const n = ctx.state.phase.count as number;
    const keep = Array.isArray(a.keep) ? a.keep : [];
    const ok =
      keep.length === HABSBURG_KEEP &&
      new Set(keep).size === HABSBURG_KEEP &&
      keep.every((i) => Number.isInteger(i) && i >= 0 && i < n);
    return ok ? null : 'Keep three of the cards';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    const d = civData(ctx);
    const drawn = d.habsburg?.drawn ?? [];
    delete d.habsburg;
    ctx.setPhase(ph.returnTo as Phase);
    drawn.forEach((x, i) => {
      if (a.keep.includes(i)) giveProgress(ctx, a.player, x.deck, x.card);
      else (ctx.state.decks[x.deck] ??= []).push(x.card);
    });
    ctx.emit({ type: 'civHabsburgKept', player: a.player, count: HABSBURG_KEEP });
    progressCheck(ctx);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return keepSets(ctx.state.phase.count as number).map((keep) => ({
      type: 'civHabsburgKeep',
      player,
      keep,
    }));
  },
});

/** The Habsburg cards drawn, for the player who drew them. */
export const habsburgDrawn = (ctx: Ctx): Drawn[] =>
  ctx.state.phase.id === 'civHabsburg' ? (civView(ctx).habsburg?.drawn ?? []) : [];

export const boardActions: Record<string, ActionDef> = {
  civGallic,
  civRevolution,
  civTiticaca,
  civLeap,
  civKhagan,
  civMuscovy,
  civMuscovyHex,
  civHabsburg,
  civHabsburgKeep,
};
