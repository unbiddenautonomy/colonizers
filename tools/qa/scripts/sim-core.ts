/**
 * QA harness: plays whole games with bots through the same set-up code the
 * server uses for online rooms, and checks invariants after every move.
 *
 * REPO env var picks the checkout (default: the newest branch).
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const REPO = process.env.REPO ?? '../../..';

const rules = await import(`${REPO}/apps/server/src/rules.ts`);
const protocol = await import(`${REPO}/apps/server/src/protocol.ts`);
const botsPkg = await import(`${REPO}/packages/bots/src/index.ts`);
const engine = await import(`${REPO}/packages/engine/src/index.ts`);
const describeMod = await import(`${REPO}/apps/web/src/game/describe.ts`);
const statsPkg = await import(`${REPO}/packages/stats/src/index.ts`);

export const library = rules.library;
export const buildConfig = rules.buildConfig;
export const timeoutAction = rules.timeoutAction;
export const timedSeats = rules.timedSeats;
export const { DEFAULT_SETTINGS, DEFAULT_OPTIONS, cleanSettings } = protocol;
export const { chooseAction, newMemory } = botsPkg;
export const { Ctx } = engine;
export const describe = describeMod.describe;
export const analyzeGame = statsPkg.analyzeGame;

export type Any = Record<string, any>;

export interface SimSpec {
  /** Label for reports. */
  name: string;
  /** Room settings (partial; merged over the defaults and cleaned like the server does). */
  settings: Any;
  players: number;
  seed: string;
  /** Bot per seat: level and style. Default medium/mixed. */
  bots?: { level: string; style: string }[];
  /** Give up after this many rounds. */
  maxRounds?: number;
  maxActions?: number;
  /** Hard-bot thinking budget. */
  budgetMs?: number;
  /** Skip the heavier end-of-game checks. */
  light?: boolean;
  /** Seats that play only timer "safe moves" (an absent human on a turn timer). */
  afk?: number[];
}

export interface SimResult {
  name: string;
  seed: string;
  players: number;
  modules: string[];
  vpTarget: number;
  outcome: 'won' | 'maxRounds' | 'maxActions' | 'deadlock' | 'crash';
  error?: string;
  errorStack?: string;
  dump?: string;
  timedOut?: boolean;
  viewCrashes?: Record<string, number>;
  winner: number | null;
  rounds: number;
  turns: number;
  actions: number;
  vp: number[];
  ms: number;
  maxChooseMs: number;
  maxApplyMs: number;
  slowChoose: number;
  problems: string[];
  actionTypes: Record<string, number>;
  eventTypes: Record<string, number>;
  undescribed: string[];
  badText: string[];
  lastPhase: string;
  stuckInfo?: Any;
  replayOk?: boolean;
  statsOk?: boolean;
  stateBytes?: number;
  replayMs?: number;
  refusals: number;
  botNulls: number;
}

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const STYLES = ['balanced', 'builder', 'city', 'army', 'trader'];

function findBadNumbers(v: unknown, path: string, out: string[], depth = 0): void {
  if (out.length > 5 || depth > 12) return;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path}=${v}`);
    return;
  }
  if (v === undefined) {
    return;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Any)) findBadNumbers(x, `${path}.${k}`, out, depth + 1);
  }
}

/** Checks that must hold after every move. Returns problems found. */
function checkInvariants(state: Any, registry: Any, initialTotals: Record<string, number>): string[] {
  const out: string[] = [];
  // Cards: nothing negative, whole numbers.
  for (const p of state.players) {
    for (const [c, n] of Object.entries(p.hand as Record<string, number>)) {
      if (n < 0 || !Number.isInteger(n)) out.push(`hand[${p.seat}].${c}=${n}`);
      if (!registry.cardTypes[c] && n !== 0) out.push(`unknown card in hand: ${c}`);
    }
  }
  for (const [c, n] of Object.entries(state.bank as Record<string, number>)) {
    if (n < 0 || !Number.isInteger(n)) out.push(`bank.${c}=${n}`);
  }
  // Conservation: bank + hands stays what the game started with.
  const totals: Record<string, number> = {};
  for (const [c, n] of Object.entries(state.bank as Record<string, number>)) totals[c] = (totals[c] ?? 0) + n;
  for (const p of state.players)
    for (const [c, n] of Object.entries(p.hand as Record<string, number>)) totals[c] = (totals[c] ?? 0) + n;
  for (const c of new Set([...Object.keys(totals), ...Object.keys(initialTotals)])) {
    if ((totals[c] ?? 0) !== (initialTotals[c] ?? 0))
      out.push(`cards not conserved: ${c} ${initialTotals[c] ?? 0} -> ${totals[c] ?? 0}`);
  }
  // Pieces: supply limits, one building per corner.
  const perOwner: Record<string, number> = {};
  const cornerBuildings: Record<string, number> = {};
  const edgeRoutes: Record<string, string[]> = {};
  for (const piece of Object.values(state.pieces) as Any[]) {
    if (piece.at.kind === 'supply') continue;
    const def = registry.pieceTypes[piece.type];
    if (!def) {
      out.push(`unknown piece type ${piece.type}`);
      continue;
    }
    if (piece.owner !== null) perOwner[`${piece.owner}:${piece.type}`] = (perOwner[`${piece.owner}:${piece.type}`] ?? 0) + 1;
    if (def.building && piece.at.kind === 'corner')
      cornerBuildings[piece.at.id] = (cornerBuildings[piece.at.id] ?? 0) + 1;
    if (def.route && piece.at.kind === 'edge') (edgeRoutes[piece.at.id] ??= []).push(`${piece.type}:${piece.owner}`);
  }
  for (const [c, n] of Object.entries(cornerBuildings)) if (n > 1) out.push(`${n} buildings on ${c}`);
  for (const [e, list] of Object.entries(edgeRoutes))
    if (list.length > 1) out.push(`${list.length} route pieces on ${e}: ${list.join(',')}`);
  return out;
}

const VIEW_CHECK = process.env.VIEW_CHECK === '1';

export function runSim(spec: SimSpec): SimResult {
  const t0 = Date.now();
  const viewCrashes: Record<string, number> = {};
  const names = Array.from({ length: spec.players }, (_, i) => `P${i + 1}`);
  const settings = cleanSettings({
    ...DEFAULT_SETTINGS,
    ...spec.settings,
    options: { ...DEFAULT_OPTIONS, ...(spec.settings.options ?? {}) },
    maxPlayers: spec.players,
  });
  const res: SimResult = {
    name: spec.name,
    seed: spec.seed,
    players: spec.players,
    modules: [],
    vpTarget: 0,
    outcome: 'crash',
    winner: null,
    rounds: 0,
    turns: 0,
    actions: 0,
    vp: [],
    ms: 0,
    maxChooseMs: 0,
    maxApplyMs: 0,
    slowChoose: 0,
    problems: [],
    actionTypes: {},
    eventTypes: {},
    undescribed: [],
    badText: [],
    lastPhase: '',
    refusals: 0,
    botNulls: 0,
  };
  const problems = new Set<string>();
  const undescribed = new Set<string>();
  const badText = new Set<string>();
  let config: Any;
  let state: Any;
  const actions: Any[] = [];
  try {
    config = buildConfig(settings, names, spec.seed);
    const created = library.createGame(config);
    state = created.state;
    res.modules = state.modules;
    const registry = library.registry(state.modules);
    res.vpTarget = new Ctx(state, registry).vpTarget();
    const initialTotals: Record<string, number> = {};
    for (const [c, n] of Object.entries(state.bank as Record<string, number>)) initialTotals[c] = n;
    const rand = rng(hash(spec.seed) || 1);
    const bots =
      spec.bots ??
      names.map((_, i) => ({ level: 'medium', style: STYLES[(i * 3 + spec.players) % STYLES.length]! }));
    const memory = names.map(() => newMemory());
    const afk = new Set(spec.afk ?? []);
    const maxRounds = Math.min(spec.maxRounds ?? 150, Number(process.env.SIM_MAX_ROUNDS ?? 150));
    const maxMs = Number(process.env.SIM_MAX_MS ?? 240_000);
    const maxActions = spec.maxActions ?? 60000;
    let clock = 0;
    let idle = 0;
    let lastViewKey = '';
    const noteEvents = (events: Any[]) => {
      for (const e of events) {
        res.eventTypes[e.type] = (res.eventTypes[e.type] ?? 0) + 1;
        let text: string | null = null;
        try {
          text = describe(e, names);
        } catch (err) {
          badText.add(`describe threw on ${e.type}: ${(err as Error).message}`);
        }
        if (text === null) undescribed.add(e.type);
        else if (/undefined|NaN|\[object|null(?![a-z])/i.test(text)) badText.add(`${e.type}: ${text}`);
      }
    };
    noteEvents(created.events);
    let n = 0;
    for (; n < maxActions && state.winner === null; n++) {
      if (state.turn.round >= maxRounds) break;
      if (n % 64 === 0 && Date.now() - t0 > maxMs) {
        res.timedOut = true;
        break;
      }
      clock += 1000;
      const waiting: number[] = library.waitingOn(state);
      if (!waiting.length) {
        res.outcome = 'deadlock';
        res.error = `Nobody can act in phase ${state.phase.id}`;
        break;
      }
      let acted = false;
      const order = [...waiting].sort(() => rand() - 0.5);
      for (const seat of order) {
        let a: Any | null = null;
        const c0 = performance.now();
        if (afk.has(seat)) {
          a = timedSeats(state).includes(seat) ? timeoutAction(state, seat, rand) : null;
        } else {
          a = chooseAction(library, state, seat, bots[seat], memory[seat], {
            rand,
            now: clock,
            budgetMs: spec.budgetMs ?? 400,
          });
        }
        const cm = performance.now() - c0;
        if (cm > res.maxChooseMs) res.maxChooseMs = cm;
        if (cm > 1000) res.slowChoose++;
        if (!a) {
          res.botNulls++;
          continue;
        }
        const a0 = performance.now();
        let r: Any;
        try {
          r = library.apply(state, a);
        } catch (err) {
          // The bot picked something the full state refuses (it only sees its view).
          res.refusals++;
          if (res.refusals <= 3) problems.add(`bot move refused: ${a.type}: ${(err as Error).message}`);
          if (res.refusals > 200) throw new Error(`Too many refused bot moves; last ${a.type}: ${(err as Error).message}`);
          continue;
        }
        const am = performance.now() - a0;
        if (am > res.maxApplyMs) res.maxApplyMs = am;
        state = r.state;
        actions.push(a);
        res.actionTypes[a.type] = (res.actionTypes[a.type] ?? 0) + 1;
        noteEvents(r.events);
        for (const p of checkInvariants(state, registry, initialTotals)) problems.add(p);
        if (VIEW_CHECK) {
          // What every online client does on each render: rebuild state from its view and ask who can act.
          const key = `${state.phase.id}|${JSON.stringify(state.phase.owed ?? '')}`;
          if (key !== lastViewKey || n % 8 === 0) {
            lastViewKey = key;
            for (const viewer of [...state.players.map((p: Any) => p.seat as number), null]) {
              let vs: Any;
              const note = (what: string, err: unknown) => {
                const e = err as Error;
                const frame = (e.stack ?? '').split('\n').slice(1, 4).map((l) => l.trim().replace(/\(.*packages\//, '(').replace(/^at /, '')).join(' < ');
                const k = `${what} in phase ${state.phase.id} for ${viewer === null ? 'a watcher' : 'a player'}: ${e.message} @ ${frame}`;
                viewCrashes[k] = (viewCrashes[k] ?? 0) + 1;
              };
              try {
                vs = engine.stateFromView(library.view(state, viewer));
              } catch (err) {
                note('view', err);
                continue;
              }
              try {
                library.waitingOn(vs);
              } catch (err) {
                note('waitingOn', err);
              }
              if (viewer !== null) {
                try {
                  library.legalActions(vs, viewer);
                } catch (err) {
                  note('legalActions(own seat)', err);
                }
              }
              try {
                const vctx = new Ctx(vs, registry);
                for (const p of vs.players) vctx.vp(p.seat);
              } catch (err) {
                note('vp', err);
              }
            }
          }
        }
        acted = true;
        break;
      }
      if (!acted) {
        clock += 20_000;
        idle++;
        if (idle > 50) {
          res.outcome = 'deadlock';
          res.error = `Bots that can act keep passing in phase ${state.phase.id} (waiting on ${waiting.join(',')})`;
          break;
        }
      } else idle = 0;
    }
    res.actions = actions.length;
    if (state.winner !== null) res.outcome = 'won';
    else if (res.outcome !== 'deadlock') res.outcome = state.turn.round >= maxRounds ? 'maxRounds' : 'maxActions';
    const ctx = new Ctx(state, registry);
    res.vp = state.players.map((p: Any) => ctx.vp(p.seat));
    res.winner = state.winner;
    res.rounds = state.turn.round;
    res.turns = state.turn.number;
    res.lastPhase = state.phase.id;
    if (state.winner !== null) {
      if (res.vp[state.winner]! < res.vpTarget) problems.add(`winner has ${res.vp[state.winner]} of ${res.vpTarget}`);
    }
    const bad: string[] = [];
    findBadNumbers(state, 'state', bad);
    for (const b of bad) problems.add(`bad number ${b}`);
    if (res.outcome !== 'won') {
      const waiting: number[] = library.waitingOn(state);
      res.stuckInfo = {
        phase: state.phase,
        waiting,
        legal: Object.fromEntries(
          waiting.map((s) => {
            const counts: Record<string, number> = {};
            for (const a of library.legalActions(state, s)) counts[a.type] = (counts[a.type] ?? 0) + 1;
            return [s, counts];
          }),
        ),
        hands: state.players.map((p: Any) => p.hand),
        supply: state.players.map((p: Any) =>
          Object.fromEntries(
            ['road', 'settlement', 'city', 'ship'].map((t) => {
              try {
                return [t, ctx.supplyLeft(p.seat, t)];
              } catch {
                return [t, null];
              }
            }),
          ),
        ),
        bank: state.bank,
      };
    }
    if (!spec.light) {
      // Views: every seat and a spectator.
      for (const viewer of [...names.map((_, i) => i), null]) {
        try {
          const view = library.view(state, viewer as number | null);
          JSON.stringify(view);
        } catch (err) {
          problems.add(`view(${viewer}) threw: ${(err as Error).message}`);
        }
      }
      res.stateBytes = JSON.stringify(state).length;
      // Replay gives the same state (saves, reconnects and stats depend on it).
      try {
        const r0 = performance.now();
        const replayed = library.replay(config, actions);
        res.replayMs = performance.now() - r0;
        res.replayOk = JSON.stringify(replayed) === JSON.stringify(state);
        if (!res.replayOk) problems.add('replay differs from the live state');
      } catch (err) {
        res.replayOk = false;
        problems.add(`replay threw: ${(err as Error).message}`);
      }
      try {
        const analysis = analyzeGame(library, config, actions);
        const badStats: string[] = [];
        findBadNumbers(analysis, 'stats', badStats);
        for (const b of badStats) problems.add(`bad stats number ${b}`);
        res.statsOk = badStats.length === 0;
      } catch (err) {
        res.statsOk = false;
        problems.add(`analyzeGame threw: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    res.outcome = 'crash';
    res.error = (err as Error).message;
    res.errorStack = ((err as Error).stack ?? '').split('\n').slice(0, 8).join('\n');
    if (state) {
      res.actions = actions.length;
      res.rounds = state.turn.round;
      res.turns = state.turn.number;
      res.lastPhase = state.phase.id;
    }
  }
  // SIM_DUMP=<dir>: keep the config and move list of every game that did not end normally
  // (or of every game with SIM_DUMP_ALL=1), so it can be replayed and inspected.
  if (process.env.SIM_DUMP && config && (res.outcome !== 'won' || problems.size > 0 || process.env.SIM_DUMP_ALL)) {
    try {
      mkdirSync(process.env.SIM_DUMP, { recursive: true });
      const file = `${process.env.SIM_DUMP}/${spec.name.replace(/[^a-z0-9.+-]+/gi, '_')}__${spec.seed.replace(/[^a-z0-9.+-]+/gi, '_')}.json`;
      writeFileSync(file, JSON.stringify({ spec, config, actions }));
      res.dump = file;
    } catch {
      /* best effort */
    }
  }
  res.problems = [...problems];
  res.undescribed = [...undescribed];
  res.badText = [...badText];
  if (VIEW_CHECK) res.viewCrashes = viewCrashes;
  res.ms = Date.now() - t0;
  return res;
}
