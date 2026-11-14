import type { Action, ActionDef, Ctx, GameModule, HexId, Phase, Piece } from '@colonizers/engine';
import { baseData } from '@colonizers/module-base';
import {
  barbarianTrack,
  ckData,
  defineFanCards,
  isActive,
  isKnight,
  knightLevel,
  knightsOf,
  landBarbarians,
  merchant,
  wrapFanCards,
} from '@colonizers/module-cities-knights';
import {
  DUKE_CARD,
  DUKE_MAX,
  DUKE_MIN,
  dukeTargets,
  fogged,
  foggedCities,
  foggedStrength,
  freezeBlock,
  JUNKER,
  junker,
  junkerCanMove,
  junkerHex,
  junkerHexes,
  knightMoveBlock,
  MODULE_ID,
  NEUTRAL_CARDS,
  scholar,
  SCHOLAR_CARD,
  scholarTargets,
  scholarWorks,
  sfData,
  frozenEdge,
  type ScholarMark,
} from './rules.ts';

export * from './rules.ts';

/**
 * Strategist & Commander, a fan expansion for Cities & Knights (by Peter Höing
 * and Michael Tidden of a Catan club in the West Münsterland):
 *
 * - **The Junker**, a neutral piece. Whoever rolls doubles puts it on any land
 *   field once the roll is worked out, or moves it there; before the
 *   barbarians first reach Catan it stays where it first landed. It leaves
 *   when they land, and comes back on the next doubles.
 *   - It freezes its field: nothing is built on its corners or paths, no
 *     knight moves onto or off them, and the robber can't be moved there (it
 *     may leave). Progress cards still work there. Production goes on.
 *   - It hides its field from the barbarians: knights and cities on its
 *     corners count for neither side, and a city there can't be lost.
 * - **The Duke** (5 politics cards) joins a knight and moves with it: your own
 *   knight is 1 stronger (3 at most), a rival's 1 weaker (1 at least).
 * - **The Scholar** (5 science cards) joins a settlement or city: until the
 *   barbarians next land, whatever it produces, the Scholar's owner gets the
 *   same again.
 * - Deactivating your active strong or mighty knight moves the barbarian
 *   ship one step forward or back.
 * - Neutral pieces score nothing: the merchant loses its point.
 * - The Smith moves from the science deck to politics.
 */

interface OwedPhase extends Phase {
  owed: Record<number, number>;
  returnTo: Phase;
}

const owes = (ctx: Ctx, seat: number) => ((ctx.state.phase as OwedPhase).owed?.[seat] ?? 0) > 0;
const back = (ctx: Ctx) => ctx.setPhase((ctx.state.phase as OwedPhase).returnTo ?? { id: 'main' });

const placeJunker: ActionDef = {
  phases: ['placeJunker'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not your Junker';
    return junkerHexes(ctx).includes(a.hex as HexId) ? null : 'Put the Junker on a land field';
  },
  apply(ctx, a) {
    const at = { kind: 'hex' as const, id: a.hex as HexId };
    const j = junker(ctx);
    if (j) ctx.move(j, at);
    else ctx.place(JUNKER, null, at);
    (junker(ctx) as Piece).props.attacks = ckData(ctx).attacks;
    ctx.emit({ type: 'junkerPlaced', player: a.player, hex: a.hex });
    back(ctx);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return junkerHexes(ctx).map((hex) => ({ type: 'placeJunker', player, hex }));
  },
};

const placeSfDuke: ActionDef = {
  phases: ['placeSfDuke'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not your Duke';
    return dukeTargets(ctx, a.player).some((k) => k.id === a.knight)
      ? null
      : 'The Duke joins a knight on the board';
  },
  apply(ctx, a) {
    for (const p of Object.values(ctx.state.pieces)) if (isKnight(p)) delete p.props.duke;
    const k = ctx.state.pieces[a.knight as string] as Piece;
    k.props.duke = a.player;
    ctx.emit({ type: 'dukePlaced', player: a.player, owner: k.owner, at: k.at });
    back(ctx);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return dukeTargets(ctx, player).map((k) => ({ type: 'placeSfDuke', player, knight: k.id }));
  },
};

const placeSfScholar: ActionDef = {
  phases: ['placeSfScholar'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Not your Scholar';
    return scholarTargets(ctx, a.player).includes(a.corner as never)
      ? null
      : 'The Scholar goes to a settlement or city';
  },
  apply(ctx, a) {
    for (const p of Object.values(ctx.state.pieces)) delete p.props.scholar;
    const b = ctx.buildingAt(a.corner as never) as Piece;
    const mark: ScholarMark = { owner: a.player, attacks: ckData(ctx).attacks };
    b.props.scholar = mark;
    ctx.emit({ type: 'scholarPlaced', player: a.player, owner: b.owner, at: a.corner });
    back(ctx);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return scholarTargets(ctx, player).map((corner) => ({
      type: 'placeSfScholar',
      player,
      corner,
    }));
  },
};

/** A strong or mighty knight steps down and moves the barbarian ship a step. */
const shiftBarbarians: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const k = ctx.state.pieces[a.knight as string];
    if (!k || !isKnight(k) || k.owner !== a.player) return 'That is not your knight';
    if (!isActive(k)) return 'Only an active knight can step down';
    if (knightLevel(k) < 2) return 'Only a strong or mighty knight moves the barbarians';
    const d = ckData(ctx);
    if (a.steps === -1) return d.barbarian > 0 ? null : 'The barbarians are still in port';
    if (a.steps === 1) return null;
    return 'Move the ship one step forward or back';
  },
  apply(ctx, a) {
    const k = ctx.state.pieces[a.knight as string] as Piece;
    k.props.active = false;
    delete k.props.activatedTurn;
    const d = ckData(ctx);
    const steps = a.steps as number;
    d.barbarian += steps;
    ctx.emit({
      type: 'barbariansShifted',
      player: a.player,
      steps,
      at: d.barbarian,
      of: barbarianTrack(ctx),
    });
    if (d.barbarian >= barbarianTrack(ctx)) landBarbarians(ctx, { id: 'main' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return knightsOf(ctx, player)
      .filter((k) => isActive(k) && knightLevel(k) >= 2)
      .flatMap((k) =>
        [1, -1]
          .map((steps) => ({ type: 'shiftBarbarians', player, knight: k.id, steps }))
          .filter((x) => !shiftBarbarians.check(ctx, x)),
      );
  },
};

const FAN_CARDS = defineFanCards(MODULE_ID, {
  [DUKE_CARD]: {
    count: NEUTRAL_CARDS,
    deck: 'politics',
    check: (ctx, a) => (dukeTargets(ctx, a.player).length ? null : 'No knight for the Duke'),
    apply(ctx, a) {
      ctx.setPhase({ id: 'placeSfDuke', owed: { [a.player]: 1 }, returnTo: ctx.state.phase });
    },
  },
  [SCHOLAR_CARD]: {
    count: NEUTRAL_CARDS,
    deck: 'science',
    check: (ctx, a) =>
      scholarTargets(ctx, a.player).length ? null : 'No settlement or city for the Scholar',
    apply(ctx, a) {
      ctx.setPhase({ id: 'placeSfScholar', owed: { [a.player]: 1 }, returnTo: ctx.state.phase });
    },
  },
});

/** Adds a freeze check to an action, and keeps frozen options out of its list. */
const frozen =
  (block: (ctx: Ctx, a: Action) => string | null) =>
  (prev: ActionDef): ActionDef => ({
    ...prev,
    check: (ctx, a) => block(ctx, a) ?? prev.check(ctx, a),
    enumerate: (ctx, player) => (prev.enumerate?.(ctx, player) ?? []).filter((a) => !block(ctx, a)),
  });

const knightBlock = (ctx: Ctx, a: Action): string | null => {
  if (!junker(ctx)) return null;
  const k = ctx.state.pieces[a.knight as string];
  return k && fogged(ctx, k) ? 'The Junker has frozen that field' : null;
};

const robberBlock = (ctx: Ctx, a: Action): string | null =>
  a.hex !== undefined && a.hex === junkerHex(ctx) ? 'The robber can not go to the Junker' : null;

const chaseBlock = (ctx: Ctx): string | null => {
  const r = ctx.piecesOfType('robber')[0];
  const h = junkerHex(ctx);
  return h && r?.at.kind === 'hex' && r.at.id === h
    ? 'Knights can not chase the robber from the Junker’s field'
    : null;
};

const shipBlock = (ctx: Ctx, a: Action): string | null => {
  if (!junker(ctx)) return null;
  const s = ctx.state.pieces[a.ship as string];
  if (s?.at.kind === 'edge' && frozenEdge(ctx, s.at.id)) return 'The Junker has frozen that field';
  return frozenEdge(ctx, a.to) ? 'The Junker has frozen that field' : null;
};

/** Doubles: the roller puts down the Junker once the roll is worked out. */
function afterRoll(ctx: Ctx): void {
  const d = sfData(ctx);
  if (ctx.events.some((e) => e.type === 'production')) {
    const roll = baseData(ctx).lastRoll as { dice?: Record<string, unknown> } | null | undefined;
    const dice = roll?.dice;
    if (dice && typeof dice.red === 'number' && dice.red === dice.yellow && junkerCanMove(ctx))
      d.junkerDue = ctx.active;
  }
  // The barbarians landed: the Junker and the Scholar leave (once any lost city is picked).
  const attacks = ckData(ctx).attacks;
  const j = junker(ctx);
  if (j && attacks > ((j.props.attacks as number | undefined) ?? 0)) {
    if (ctx.state.phase.id !== 'loseCity') {
      ctx.remove(j);
      ctx.emit({ type: 'junkerLeft' });
    }
  }
  const s = scholar(ctx);
  if (s && !scholarWorks(ctx, s.mark)) {
    delete s.building.props.scholar;
    ctx.emit({ type: 'scholarLeft', owner: s.mark.owner });
  }
  if (
    d.junkerDue !== null &&
    ctx.state.phase.id === 'main' &&
    ctx.active === d.junkerDue &&
    ctx.state.winner === null
  ) {
    d.junkerDue = null;
    if (junkerCanMove(ctx) && junkerHexes(ctx).length)
      ctx.setPhase({ id: 'placeJunker', owed: { [ctx.active]: 1 }, returnTo: { id: 'main' } });
  }
  // A turn ended before the roll was worked out: the chance is gone.
  if (d.junkerDue !== null && ctx.active !== d.junkerDue) d.junkerDue = null;
}

export const strategistModule: GameModule = {
  id: MODULE_ID,
  name: 'Strategist & Commander',
  requires: ['cities-knights'],
  conflicts: ['greed-wealth-power', 'landwater'],
  pieceTypes: {
    [JUNKER]: { on: 'hex' },
  },
  actions: { placeJunker, placeSfDuke, placeSfScholar, shiftBarbarians },
  wrapActions: {
    playProgress: wrapFanCards(FAN_CARDS),
    buildSettlement: frozen(freezeBlock),
    buildCity: frozen(freezeBlock),
    buildRoad: frozen(freezeBlock),
    buildKnight: frozen(freezeBlock),
    buildWall: frozen(freezeBlock),
    promoteKnight: frozen(knightBlock),
    moveKnight: frozen(knightMoveBlock),
    displaceKnight: frozen(knightMoveBlock),
    relocateKnight: frozen(freezeBlock),
    chaseRobber: frozen(chaseBlock),
    moveRobber: frozen(robberBlock),
  },
  wrapActionsIfPresent: {
    buildShip: frozen(freezeBlock),
    moveShip: frozen(shipBlock),
  },
  hooks: {
    init(ctx) {
      sfData(ctx);
      const decks = ctx.state.decks;
      // The Smith moves to politics; the Duke and the Scholar join their decks.
      const science = decks.science ?? [];
      const smiths = science.filter((c) => c === 'smith');
      const more = (card: string) => Array<string>(NEUTRAL_CARDS).fill(card);
      if (decks.science)
        decks.science = ctx.rng.shuffle([
          ...science.filter((c) => c !== 'smith'),
          ...more(SCHOLAR_CARD),
        ]);
      if (decks.politics)
        decks.politics = ctx.rng.shuffle([...decks.politics, ...smiths, ...more(DUKE_CARD)]);
    },
    afterAction(ctx) {
      afterRoll(ctx);
    },
  },
  reducers: {
    barbarians(ctx, value) {
      return value - foggedCities(ctx);
    },
    defense(ctx, seat, value) {
      return value - foggedStrength(ctx, seat);
    },
    shielded(ctx, piece, value) {
      return value || (piece.type === 'city' && !!junker(ctx) && fogged(ctx, piece));
    },
    knightStrength(ctx, knight, value) {
      const owner = knight.props.duke;
      if (typeof owner !== 'number') return value;
      if (owner === knight.owner) return value >= DUKE_MAX ? value : value + 1;
      return value <= DUKE_MIN ? value : value - 1;
    },
    yieldShares(ctx, _hex, piece, shares) {
      const m = piece.props.scholar as ScholarMark | undefined;
      if (!m || piece.owner === null || !scholarWorks(ctx, m)) return shares;
      const got = shares[piece.owner] ?? {};
      const theirs = { ...(shares[m.owner] ?? {}) };
      for (const [card, n] of Object.entries(got)) theirs[card] = (theirs[card] ?? 0) + n;
      return { ...shares, [m.owner]: theirs };
    },
    vp(ctx, seat, value) {
      // Neutral pieces score nothing.
      return merchant(ctx)?.owner === seat ? value - 1 : value;
    },
  },
};
