/**
 * Messages between the browser and a game room. The browser imports this file
 * too, so keep it free of Worker-only code.
 */
import type { Action, GameEvent, GameView } from '@colonizers/engine';
import { cleanCustomMap, type MapFile } from '@colonizers/maps';

export type MapChoice =
  | { kind: 'preset'; id: string }
  /** A map drawn in the map editor, sent whole by the host. */
  | { kind: 'custom'; map: MapFile }
  | { kind: 'random'; mode: 'classic' | 'balanced' | 'wild' }
  | { kind: 'scenario'; id: string }
  | { kind: 'special'; id: string };

export type TurnModeChoice = 'auto' | 'normal' | 'specialBuild' | 'paired';

/** Game options and house rules (PLAN.md sections 1.4 and 1.5). Off means the standard rules. */
export interface GameOptions {
  /** auto: Special Building Phase for 5–6 players, paired turns for 7–8, normal otherwise. */
  turnMode: TurnModeChoice;
  friendlyRobber: boolean;
  /** The robber goes back to the desert at the end of any turn it was moved. */
  robberHome: boolean;
  /** Any player may offer a trade on someone else's turn, not just the player whose turn it is. */
  openTrading: boolean;
  balancedDice: boolean;
  /** Rounds at the start in which a 7 does nothing. */
  robberFreeRounds: number;
  gifting: boolean;
  /** Most cards you can hold when a 7 is rolled. */
  discardLimit: number;
  /** The first settlement pays starting resources too. */
  firstSettlementPays: boolean;
  /** 2 points for the player with the most buildings on harbors (at least 3 points' worth). */
  harbormaster: boolean;
  /** A deck of event cards replaces the dice (not with Cities & Knights). */
  eventCards: boolean;
  /** Duel rules for two players: neutral builders, two rolls a turn, trade tokens. */
  twoPlayer: boolean;
  /** Greed, Wealth & Power: the river and swampland take the place of the desert and three hexes. */
  gwpRiver: boolean;
  /** World Wonders: you can win without a finished wonder. */
  wonderOptional: boolean;
}

export const TURN_MODES: readonly TurnModeChoice[] = ['auto', 'normal', 'specialBuild', 'paired'];
export const ROBBER_FREE_ROUNDS = [0, 1, 2, 3] as const;
export const DISCARD_LIMITS = [7, 8, 9, 10] as const;

export const DEFAULT_OPTIONS: GameOptions = {
  turnMode: 'auto',
  friendlyRobber: false,
  robberHome: false,
  openTrading: false,
  balancedDice: false,
  robberFreeRounds: 0,
  gifting: false,
  discardLimit: 7,
  firstSettlementPays: false,
  harbormaster: false,
  eventCards: false,
  twoPlayer: false,
  gwpRiver: false,
  wonderOptional: false,
};

export function cleanOptions(raw: unknown): GameOptions {
  const o = (typeof raw === 'object' && raw ? raw : {}) as Record<string, unknown>;
  return {
    turnMode: TURN_MODES.includes(o.turnMode as TurnModeChoice)
      ? (o.turnMode as TurnModeChoice)
      : 'auto',
    friendlyRobber: o.friendlyRobber === true,
    robberHome: o.robberHome === true,
    openTrading: o.openTrading === true,
    balancedDice: o.balancedDice === true,
    robberFreeRounds: int(o.robberFreeRounds, ROBBER_FREE_ROUNDS, 0),
    gifting: o.gifting === true,
    discardLimit: int(o.discardLimit, DISCARD_LIMITS, 7),
    firstSettlementPays: o.firstSettlementPays === true,
    harbormaster: o.harbormaster === true,
    eventCards: o.eventCards === true,
    twoPlayer: o.twoPlayer === true,
    gwpRiver: o.gwpRiver === true,
    wonderOptional: o.wonderOptional === true,
  };
}

export function resolvedTurnMode(
  o: GameOptions,
  players: number,
): 'normal' | 'specialBuild' | 'paired' {
  if (o.turnMode !== 'auto') return o.turnMode === 'paired' && players < 4 ? 'normal' : o.turnMode;
  return players >= 7 ? 'paired' : players >= 5 ? 'specialBuild' : 'normal';
}

/** Engine settings for the options. */
export function optionSettings(o: GameOptions, players: number): Record<string, unknown> {
  return {
    turnMode: resolvedTurnMode(o, players),
    friendlyRobber: o.friendlyRobber,
    robberHome: o.robberHome,
    openTrading: o.openTrading,
    balancedDice: o.balancedDice,
    robberFreeRounds: o.robberFreeRounds,
    gifting: o.gifting,
    discardLimit: o.discardLimit,
    startingResourcesBothRounds: o.firstSettlementPays,
    harbormaster: o.harbormaster,
    eventCards: o.eventCards,
    twoPlayer: o.twoPlayer && players === 2,
    gwpRiver: o.gwpRiver,
    wonderToWin: !o.wonderOptional,
  };
}

/** Modules in the order they must load: options before Cities & Knights so its dice win. */
export function moduleList(
  extra: readonly string[],
  citiesKnights: boolean,
  greedWealthPower = false,
  worldWonders = false,
  civilisations = false,
  church = false,
  witches = false,
): string[] {
  const order = [
    'base',
    'seafarers',
    'special-maps',
    'traders-barbarians',
    'explorers-pirates',
    // After the base game and Seafarers, so it replaces their roads and ships; before the
    // variants (so out-of-turn building wraps it) and Cities & Knights (whose roll ends in ours).
    'landwater',
    'variants',
    'cities-knights',
    // Land & Water's Cities & Knights rules, wrapping that expansion's knights and cards.
    'landwater-ck',
    // Strategist & Commander, wrapping Cities & Knights' knights, robber and cards.
    'strategist',
    // After the base game and Cities & Knights, so its robber wrapper comes outermost.
    'princes',
    // After the base game, so its turn and road wrappers come outermost.
    'soldiers',
    // After those, so its robber wrapper comes outermost (a 7's robber steals nothing).
    'investors',
    // After the base game, so its end-of-turn battles come before the turn passes.
    'kingdoms',
    // After Cities & Knights (and Seafarers), so their production changes come last.
    // Witches first, so the Wizard's guard against the robber doesn't lift a festival.
    'witches',
    'church',
    'greed-wealth-power',
    // After those, so its roll wrapper comes outermost.
    'world-wonders',
    // After Cities & Knights, so its scenarios can adjust knight moves.
    'treasures-dragons',
    // Last, so it deals civilisations once every other module has set up.
    'civilisations',
  ];
  const want = new Set([
    'base',
    'variants',
    ...extra,
    ...(citiesKnights ? ['cities-knights'] : []),
    ...(citiesKnights && greedWealthPower ? ['greed-wealth-power'] : []),
    // Church, Faith & Reformation on its own; Greed, Wealth & Power has its own Religion.
    ...(citiesKnights && church && !greedWealthPower ? ['church'] : []),
    // Witches, Wizards & Dragons likewise; Greed, Wealth & Power has its own Magic.
    ...(citiesKnights && witches && !greedWealthPower ? ['witches'] : []),
    ...(worldWonders ? ['world-wonders'] : []),
    ...(citiesKnights && greedWealthPower && civilisations ? ['civilisations'] : []),
    ...(citiesKnights && extra.includes('landwater') ? ['landwater-ck'] : []),
  ]);
  return order.filter((m) => want.has(m));
}

/** A short key for the map, saved with each game for stats by map. */
export function mapKey(map: MapChoice): string {
  switch (map.kind) {
    case 'random':
      return `random:${map.mode}`;
    case 'custom':
      return `custom:${map.map.id}`;
    default:
      return `${map.kind}:${map.id}`;
  }
}

export interface RoomSettings {
  map: MapChoice;
  vpTarget: number;
  /** Play with the Cities & Knights expansion. */
  citiesKnights: boolean;
  /** Add the Greed, Wealth & Power fan expansion on top of Cities & Knights. */
  greedWealthPower: boolean;
  /** Add World Wonders (any map but the special ones). */
  worldWonders: boolean;
  /** Add Civilisations on top of Greed, Wealth & Power. */
  civilisations: boolean;
  /** Add Church, Faith & Reformation on top of Cities & Knights (not with Greed, Wealth & Power). */
  church: boolean;
  /** Add Witches, Wizards & Dragons on top of Cities & Knights (not with Greed, Wealth & Power). */
  witches: boolean;
  /** Add Princes & Explorers (SiedlerInsel) to the base game on the usual maps. */
  princes: boolean;
  /** Add Soldiers & Armies (SiedlerInsel) to the base game on the usual maps. */
  soldiers: boolean;
  /** Add Investors & Speculators (SiedlerInsel) to the base game on the usual maps. */
  investors: boolean;
  /** Add Kingdoms & Warriors (SiedlerInsel) to the base game on the usual maps and Seafarers. */
  kingdoms: boolean;
  /** Add Land & Water (SiedlerInsel): vehicles instead of roads, on the usual maps and Seafarers. */
  landWater: boolean;
  /** Add Strategist & Commander (fan expansion) on top of Cities & Knights. */
  strategist: boolean;
  /** Seconds per turn before the room plays a safe move for you. 0 turns it off. */
  turnTimer: number;
  /**
   * Extra seconds each player may spend over the turn timer across the whole game, like a
   * chess clock. When a step's timer runs out the player's bank starts; when that is empty too,
   * the room plays a safe move. 0 turns it off.
   */
  timeBank: number;
  maxPlayers: number;
  options: GameOptions;
}

/** Seconds per turn. The long ones are for async games played over days. */
export const TURN_TIMERS = [0, 60, 90, 120, 180, 300, 3600, 21600, 43200, 86400, 259200] as const;
/** Seconds in each player's time bank. */
export const TIME_BANKS = [0, 60, 120, 300, 600, 3600, 86400] as const;
export const VP_TARGETS = [8, 9, 10, 11, 12, 13, 14, 15] as const;

export const DEFAULT_SETTINGS: RoomSettings = {
  map: { kind: 'random', mode: 'classic' },
  vpTarget: 10,
  citiesKnights: false,
  greedWealthPower: false,
  worldWonders: false,
  civilisations: false,
  church: false,
  witches: false,
  princes: false,
  soldiers: false,
  investors: false,
  kingdoms: false,
  landWater: false,
  strategist: false,
  turnTimer: 0,
  timeBank: 0,
  maxPlayers: 4,
  options: DEFAULT_OPTIONS,
};

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface MemberInfo {
  id: string;
  name: string;
  /** Seat in the running game, or null for spectators and everyone in the lobby. */
  seat: number | null;
  role: 'player' | 'spectator';
  online: boolean;
  /** Set for computer players. */
  bot?: { level: BotLevel; style: BotStyle };
}

export type BotLevel = 'easy' | 'medium' | 'hard';
export type BotStyle = 'balanced' | 'builder' | 'city' | 'army' | 'trader';
const BOT_LEVELS: readonly string[] = ['easy', 'medium', 'hard'];
const BOT_STYLES: readonly string[] = ['balanced', 'builder', 'city', 'army', 'trader'];

export interface RoomInfo {
  code: string;
  status: RoomStatus;
  hostId: string | null;
  settings: RoomSettings;
  members: MemberInfo[];
}

export interface LogEntry {
  seq: number;
  event: GameEvent;
}

export interface GameSnapshot {
  view: GameView;
  seq: number;
  /** When the turn timer runs out, in server time (ms), or null. */
  deadline: number | null;
  /** Time bank left per seat in ms (counted to now), or null when there is no time bank. */
  bank?: number[] | null;
  /** The seat spending its time bank right now: the deadline is then the bank's end. */
  banking?: number | null;
}

export interface ChatMessage {
  id: number;
  /** Member id, or null for messages from the room itself. */
  from: string | null;
  name: string;
  text: string;
  at: number;
}

export type ClientMessage =
  | { type: 'hello'; token: string; name: string }
  | { type: 'rename'; name: string }
  | { type: 'settings'; settings: RoomSettings }
  | { type: 'start' }
  | { type: 'remove'; member: string }
  | { type: 'addBot'; level: BotLevel; style: BotStyle }
  | { type: 'leave' }
  | { type: 'act'; action: Action }
  | { type: 'chat'; text: string }
  | { type: 'nudge'; seat: number }
  | { type: 'rematch' };

export type ServerMessage =
  | {
      type: 'welcome';
      you: string;
      room: RoomInfo;
      game: GameSnapshot | null;
      log: LogEntry[];
      chat: ChatMessage[];
      now: number;
    }
  | { type: 'room'; room: RoomInfo }
  | { type: 'game'; game: GameSnapshot; events: LogEntry[]; now: number }
  | { type: 'chat'; message: ChatMessage }
  /** Achievements the game that just ended unlocked, by seat. */
  | { type: 'achievements'; unlocked: { seat: number; ids: string[] }[] }
  | { type: 'error'; message: string; code?: 'removed' | 'notFound' | 'rule' | 'denied' };

/** Big enough for a room's settings with a large custom map in them. */
export const MAX_MESSAGE = 24_576;
export const MAX_CHAT = 300;
export const ROOM_CODE = /^[a-z0-9-]{1,40}$/;

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
// Like CONTROL but keeps newlines in chat.
// eslint-disable-next-line no-control-regex
const CONTROL_KEEP_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

/** Cleans a display name: no control characters, 1 to 20 characters. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Guest';
  const name = raw.replace(CONTROL, '').trim().slice(0, 20);
  return name || 'Guest';
}

function int(v: unknown, allowed: readonly number[], fallback: number): number {
  return typeof v === 'number' && allowed.includes(v) ? v : fallback;
}

/** Makes any settings object safe, keeping what is valid. */
export function cleanSettings(raw: unknown): RoomSettings {
  const s = (typeof raw === 'object' && raw ? raw : {}) as Record<string, unknown>;
  const m = (typeof s.map === 'object' && s.map ? s.map : {}) as Record<string, unknown>;
  let map: MapChoice = DEFAULT_SETTINGS.map;
  if (m.kind === 'preset' && typeof m.id === 'string' && /^[a-z0-9-]{1,40}$/.test(m.id))
    map = { kind: 'preset', id: m.id };
  else if (
    m.kind === 'random' &&
    (m.mode === 'classic' || m.mode === 'balanced' || m.mode === 'wild')
  )
    map = { kind: 'random', mode: m.mode };
  else if (m.kind === 'scenario' && typeof m.id === 'string' && /^[a-z0-9-]{1,40}$/.test(m.id))
    map = { kind: 'scenario', id: m.id };
  else if (m.kind === 'special' && typeof m.id === 'string' && /^[a-z0-9-]{1,40}$/.test(m.id))
    map = { kind: 'special', id: m.id };
  else if (m.kind === 'custom') {
    const custom = cleanCustomMap(m.map);
    if ('map' in custom) map = { kind: 'custom', map: custom.map };
  }
  return {
    map,
    vpTarget: int(s.vpTarget, VP_TARGETS, DEFAULT_SETTINGS.vpTarget),
    citiesKnights: s.citiesKnights === true,
    greedWealthPower: s.greedWealthPower === true,
    worldWonders: s.worldWonders === true,
    civilisations: s.civilisations === true,
    church: s.church === true,
    witches: s.witches === true,
    princes: s.princes === true,
    soldiers: s.soldiers === true,
    investors: s.investors === true,
    kingdoms: s.kingdoms === true,
    landWater: s.landWater === true,
    strategist: s.strategist === true,
    turnTimer: int(s.turnTimer, TURN_TIMERS, DEFAULT_SETTINGS.turnTimer),
    timeBank: int(s.timeBank, TIME_BANKS, DEFAULT_SETTINGS.timeBank),
    maxPlayers: int(s.maxPlayers, [2, 3, 4, 5, 6, 7, 8], DEFAULT_SETTINGS.maxPlayers),
    options: cleanOptions(s.options),
  };
}

export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case 'hello':
      if (typeof msg.token !== 'string' || !TOKEN.test(msg.token)) return null;
      return { type: 'hello', token: msg.token, name: cleanName(msg.name) };
    case 'rename':
      return { type: 'rename', name: cleanName(msg.name) };
    case 'settings':
      return { type: 'settings', settings: cleanSettings(msg.settings) };
    case 'start':
    case 'leave':
    case 'rematch':
      return { type: msg.type };
    case 'remove':
      return typeof msg.member === 'string' ? { type: 'remove', member: msg.member } : null;
    case 'addBot':
      return typeof msg.level === 'string' &&
        BOT_LEVELS.includes(msg.level) &&
        typeof msg.style === 'string' &&
        BOT_STYLES.includes(msg.style)
        ? { type: 'addBot', level: msg.level as BotLevel, style: msg.style as BotStyle }
        : null;
    case 'act': {
      const a = msg.action as Record<string, unknown> | null;
      if (typeof a !== 'object' || a === null || typeof a.type !== 'string') return null;
      // The room fills in the player from the seat; never trust the sender.
      return { type: 'act', action: { ...a, type: a.type, player: -1 } };
    }
    case 'chat': {
      if (typeof msg.text !== 'string') return null;
      const text = msg.text.replace(CONTROL_KEEP_NEWLINE, '').trim();
      return text ? { type: 'chat', text: text.slice(0, MAX_CHAT) } : null;
    }
    case 'nudge':
      return typeof msg.seat === 'number' && Number.isInteger(msg.seat)
        ? { type: 'nudge', seat: msg.seat }
        : null;
    default:
      return null;
  }
}
