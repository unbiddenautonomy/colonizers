import {
  Ctx,
  HIDDEN_CARD,
  stateFromView,
  type Action,
  type GameState,
  type ModuleLibrary,
} from '@colonizers/engine';
import { evaluate } from './evaluate.ts';
import type { Level, Style } from './styles.ts';
import { STYLE_WEIGHTS } from './styles.ts';

export interface BotConfig {
  level: Level;
  style: Style;
}

/** What a bot remembers between moves. Losing it only makes the bot a little chattier. */
export interface BotMemory {
  turn: number;
  actionsThisTurn: number;
  offeredTurn: number;
  offeredAt: number;
}

export function newMemory(): BotMemory {
  return { turn: -1, actionsThisTurn: 0, offeredTurn: -1, offeredAt: 0 };
}

export interface ChooseOptions {
  rand?: () => number;
  /** Time now in ms, for giving up on offers nobody answers. */
  now?: number;
  /** Most milliseconds a Hard bot may think. */
  budgetMs?: number;
}

interface TradeOffer {
  id: number;
  from: number;
  give: Record<string, number>;
  get: Record<string, number>;
  to: number[] | null;
  responses: Record<number, 'accept' | 'decline'>;
}

const MAX_OPTIONS = 140;
const MAX_ACTIONS_PER_TURN = 40;
/** Actions whose outcome is luck: the bot can't (and mustn't) peek at it. */
const LUCK = new Set(['roll']);
const OFFER_WAIT_MS = 12_000;

/**
 * Picks a move for a bot. It only ever looks at what that seat is allowed to
 * see, so it can't peek at hands, decks or upcoming dice. Returns null when
 * the bot is waiting (for example on answers to its trade offer).
 */
export function chooseAction(
  lib: ModuleLibrary,
  full: GameState,
  seat: number,
  config: BotConfig,
  memory: BotMemory = newMemory(),
  opts: ChooseOptions = {},
): Action | null {
  const rand = opts.rand ?? Math.random;
  const now = opts.now ?? Date.now();
  const state = stateFromView(lib.view(full, seat));
  let options = lib.legalActions(state, seat);
  if (!options.length) return null;

  if (memory.turn !== state.turn.number) {
    memory.turn = state.turn.number;
    memory.actionsThisTurn = 0;
  }
  memory.actionsThisTurn++;

  const registry = lib.registry(state.modules);
  const offer = ((state.data.base ?? {}) as { trade?: TradeOffer | null }).trade ?? null;

  // ---- Trades ----
  if (offer && offer.from === seat) {
    const confirm = options.filter((a) => a.type === 'confirmTrade');
    if (confirm.length) {
      const ctx = new Ctx(state, registry);
      // Trade with whoever is furthest behind.
      return confirm.sort((a, b) => ctx.vp(a.with as number) - ctx.vp(b.with as number))[0]!;
    }
    const others = state.players.filter(
      (p) => p.seat !== seat && (!offer.to || offer.to.includes(p.seat)),
    );
    const answered = others.every((p) => offer.responses[p.seat]);
    if (answered || now - memory.offeredAt > OFFER_WAIT_MS)
      return options.find((a) => a.type === 'cancelTrade') ?? null;
    return null;
  }
  if (offer && offer.from !== seat) {
    const respond = options.filter((a) => a.type === 'respondTrade');
    if (respond.length) return answerOffer(state, registry, seat, config, offer, respond);
  }

  options = options.filter(
    (a) => a.type !== 'offerTrade' && a.type !== 'respondTrade' && a.type !== 'confirmTrade',
  );
  if (!options.length) return null;
  if (options.length === 1) return options[0]!;

  // Long turns end: no bot shuffles cards forever.
  const end = options.find((a) => a.type === 'endTurn' || a.type === 'endSpecialBuild');
  if (end && memory.actionsThisTurn > MAX_ACTIONS_PER_TURN) return end;

  if (options.length > MAX_OPTIONS) options = sample(options, MAX_OPTIONS, rand, end);

  const scored = scoreAll(lib, state, seat, config, options);
  if (!scored.length) return options[0]!;

  // A friendly trade before ending the turn, if it would let us build.
  if (
    end &&
    config.level !== 'easy' &&
    memory.offeredTurn !== state.turn.number &&
    state.phase.id === 'main'
  ) {
    const made = makeOffer(state, registry, seat, config, rand);
    if (made) {
      const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
      const endScore = scored.find((s) => s.action === end)?.score ?? -Infinity;
      if (best.action === end || best.score <= endScore + 0.05) {
        memory.offeredTurn = state.turn.number;
        memory.offeredAt = now;
        return made;
      }
    }
  }

  // Building out of turn (a partner in paired turns) is optional: only if it helps.
  if (!end && state.phase.id === 'main' && seat !== state.turn.player) {
    const here = evaluate(state, new Ctx(state, registry), seat, config.style);
    const best = scored.reduce((x, y) => (y.score > x.score ? y : x));
    return best.score > here + 0.3 ? best.action : null;
  }

  if (config.level === 'easy') return easyPick(scored, rand);

  let ranked = scored.sort((a, b) => b.score - a.score);
  if (config.level === 'hard')
    ranked = lookAhead(lib, state, seat, config, ranked, opts.budgetMs ?? 2500);

  const best = ranked[0]!;
  // Ending the turn wins ties, so the bot never trades in circles.
  if (end && best.action !== end) {
    const endScore = ranked.find((s) => s.action === end)?.score ?? -Infinity;
    if (best.score <= endScore + 0.05) return end;
  }
  return best.action;
}

interface Scored {
  action: Action;
  score: number;
}

function scoreAll(
  lib: ModuleLibrary,
  state: GameState,
  seat: number,
  config: BotConfig,
  options: Action[],
): Scored[] {
  const registry = lib.registry(state.modules);
  const here = evaluate(state, new Ctx(state, registry), seat, config.style);
  const out: Scored[] = [];
  for (const action of options) {
    if (LUCK.has(action.type)) {
      out.push({ action, score: here + 0.3 });
      continue;
    }
    try {
      const next = lib.apply(state, action).state;
      out.push({ action, score: evaluate(next, new Ctx(next, registry), seat, config.style) });
    } catch {
      // Some moves can't be tried on a hidden-information copy; skip them.
    }
  }
  return out;
}

/** Easy bots: usually a decent move, sometimes a random one. */
function easyPick(scored: Scored[], rand: () => number): Action {
  if (rand() < 0.3) return scored[Math.floor(rand() * scored.length)]!.action;
  const top = Math.max(...scored.map((s) => s.score));
  const weights = scored.map((s) => Math.exp((s.score - top) / 2.5));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return scored[i]!.action;
  }
  return scored[0]!.action;
}

/**
 * Hard bots: for the best few moves, play on greedily while the move is still
 * ours (robber, steals, free roads, trades then builds) and judge where that leads.
 */
function lookAhead(
  lib: ModuleLibrary,
  state: GameState,
  seat: number,
  config: BotConfig,
  ranked: Scored[],
  budgetMs: number,
): Scored[] {
  const start = Date.now();
  const registry = lib.registry(state.modules);
  const out: Scored[] = [];
  const top = ranked.slice(0, 6);
  for (const cand of top) {
    if (LUCK.has(cand.action.type) || cand.action.type === 'endTurn') {
      out.push(cand);
      continue;
    }
    let s: GameState;
    try {
      s = lib.apply(state, cand.action).state;
    } catch {
      continue;
    }
    let best = evaluate(s, new Ctx(s, registry), seat, config.style);
    for (let depth = 0; depth < 4 && Date.now() - start < budgetMs; depth++) {
      if (s.winner !== null) break;
      const waiting = lib.waitingOn(s);
      if (waiting.length !== 1 || waiting[0] !== seat) break;
      const moves = lib
        .legalActions(s, seat)
        .filter((a) => !LUCK.has(a.type) && a.type !== 'endTurn' && !a.type.endsWith('Trade'));
      if (!moves.length) break;
      let nextBest: { state: GameState; score: number } | null = null;
      for (const m of moves.length > 60 ? moves.slice(0, 60) : moves) {
        try {
          const n = lib.apply(s, m).state;
          const sc = evaluate(n, new Ctx(n, registry), seat, config.style);
          if (!nextBest || sc > nextBest.score) nextBest = { state: n, score: sc };
        } catch {
          // Skip.
        }
      }
      if (!nextBest) break;
      // In the main phase the bot may stop; elsewhere it must go on.
      if (s.phase.id === 'main' && nextBest.score <= best) break;
      s = nextBest.state;
      best = s.phase.id === 'main' ? Math.max(best, nextBest.score) : nextBest.score;
    }
    out.push({ action: cand.action, score: best });
  }
  for (const r of ranked) if (!out.some((o) => o.action === r.action)) out.push(r);
  return out.sort((a, b) => b.score - a.score);
}

function sample(options: Action[], n: number, rand: () => number, keep?: Action): Action[] {
  const copy = [...options];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  const out = copy.slice(0, n);
  if (keep && !out.includes(keep)) out.push(keep);
  return out;
}

// ---- Trading with other players ----

function withHand(state: GameState, seat: number, delta: Record<string, number>): GameState {
  const s = structuredClone(state);
  const hand = s.players[seat]!.hand;
  for (const [c, n] of Object.entries(delta)) hand[c] = Math.max(0, (hand[c] ?? 0) + n);
  return s;
}

function handGain(
  state: GameState,
  registry: ReturnType<ModuleLibrary['registry']>,
  seat: number,
  style: Style,
  delta: Record<string, number>,
): number {
  const before = evaluate(state, new Ctx(state, registry), seat, style);
  const after = withHand(state, seat, delta);
  return evaluate(after, new Ctx(after, registry), seat, style) - before;
}

function answerOffer(
  state: GameState,
  registry: ReturnType<ModuleLibrary['registry']>,
  seat: number,
  config: BotConfig,
  offer: TradeOffer,
  respond: Action[],
): Action {
  const accept = respond.find((a) => a.accept === true);
  const decline = respond.find((a) => a.accept === false)!;
  if (!accept) return decline;
  const ctx = new Ctx(state, registry);
  // Never help someone about to win.
  if (ctx.vp(offer.from) >= ctx.vpTarget() - 2) return decline;
  const delta: Record<string, number> = {};
  for (const [c, n] of Object.entries(offer.give)) delta[c] = (delta[c] ?? 0) + n;
  for (const [c, n] of Object.entries(offer.get)) delta[c] = (delta[c] ?? 0) - n;
  const gain = handGain(state, registry, seat, config.style, delta);
  const need = config.level === 'easy' ? 0.6 : 0.25;
  return gain > need ? accept : decline;
}

/** A 1-for-1 offer of a spare card for one we need, if it would help. */
function makeOffer(
  state: GameState,
  registry: ReturnType<ModuleLibrary['registry']>,
  seat: number,
  config: BotConfig,
  rand: () => number,
): Action | null {
  if (rand() > STYLE_WEIGHTS[config.style].trade) return null;
  const hand = state.players[seat]!.hand;
  const cards = Object.keys(registry.cardTypes).filter((c) => c !== HIDDEN_CARD);
  let best: { give: string; get: string; gain: number } | null = null;
  for (const give of cards) {
    if ((hand[give] ?? 0) < 1) continue;
    for (const get of cards) {
      if (get === give || registry.cardTypes[get]?.category !== registry.cardTypes[give]?.category)
        continue;
      const gain = handGain(state, registry, seat, config.style, { [give]: -1, [get]: 1 });
      if (gain > 0.8 && (!best || gain > best.gain)) best = { give, get, gain };
    }
  }
  if (!best) return null;
  return { type: 'offerTrade', player: seat, give: { [best.give]: 1 }, get: { [best.get]: 1 } };
}
