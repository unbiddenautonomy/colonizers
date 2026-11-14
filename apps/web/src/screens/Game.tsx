import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ctx,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import { baseData, publicVp } from '@colonizers/module-base';
import { nameOf, pageForError } from '@colonizers/rulebook';
import { Board, noTargets, type Targets } from '../board/Board.tsx';
import { describe } from '../game/describe.ts';
import { play, setSound, soundFor, useSound } from '../game/sounds.ts';
import { notifyHere } from '../online/push.ts';
import { library } from '../game/library.ts';
import {
  actorOf,
  clearSavedGame,
  useLocalGame,
  type LogEntry,
  type SavedGame,
} from '../game/useLocalGame.ts';
import type { ChatMessage, MemberInfo } from '../../../server/src/protocol.ts';
import type { Connection } from '../online/roomState.ts';
import type { BotConfig } from '@colonizers/bots';
import { partnerOf, type EventId } from '@colonizers/module-variants';
import { Chat } from '../ui/Chat.tsx';
import { TurnTimer } from '../ui/TurnTimer.tsx';
import { ThemePicker, useTheme } from '../theme/themes.tsx';
import { DicePicker, DiceTray } from '../ui/Dice.tsx';
import { ZoomPane } from '../ui/ZoomPane.tsx';
import { CardFlights } from '../ui/Flights.tsx';
import { MotionPicker } from '../ui/motion.tsx';
import {
  CardPicker,
  clean,
  CostLine,
  fanCommodities,
  handCards,
  RESOURCES,
  ResourceCard,
  total,
} from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';
import { PlayerBadge } from '../ui/PlayerBadge.tsx';
import { Rulebook } from '../ui/Rulebook.tsx';
import {
  BarbarianTrack,
  CK_BOARD_PHASES,
  CkBuild,
  CkChoices,
  CkPlayerStats,
  ckPrompt,
  CommodityCards,
  ProgressHand,
  seatId,
  seatPrompt,
  type CkMode,
} from './CitiesKnights.tsx';
import {
  CamelBidPanel,
  EVENT_NAME,
  EventPickDialog,
  TbActions,
  TbPlayerStats,
  tbPrompt,
  TB_MOVE_PROMPT,
  WAGON_PROMPT,
} from './TradersBarbarians.tsx';
import { TdaPlayerStats, TdaStatus } from './TreasuresDragons.tsx';
import { DuelActions, duelPrompt, DuelStats, duelTargets, GiveBackDialog } from './Duel.tsx';
import {
  EP_MODES,
  EpActions,
  EpPlayerStats,
  EpStatus,
  epPrompt,
  epTargets,
  type EpMode,
} from './ExplorersPirates.tsx';
import {
  GWP_BOARD_PHASES,
  GWP_CARD_BOARD_PHASES,
  GwpChoices,
  GwpDragonChoice,
  gwpCardPrompt,
  GWP_MODES,
  GwpActions,
  GwpPlayerStats,
  gwpPhasePrompt,
  gwpPrompt,
  gwpTargets,
  type GwpMode,
} from './GreedWealthPower.tsx';
import {
  WonderChoices,
  WonderPanel,
  wonderPrompt,
  WonderStats,
  wondersOn,
} from './WorldWonders.tsx';
import {
  CIV_MODES,
  CivChoices,
  civModePrompt,
  CivPanel,
  civPrompt,
  CivStats,
  civsOn,
  civTargets,
  type CivMode,
} from './Civilisations.tsx';
import {
  ChurchActions,
  ChurchChoices,
  churchModePrompt,
  churchOn,
  churchPrompt,
  ChurchStats,
  churchTargets,
  isChurchMode,
  type ChurchMode,
} from './Church.tsx';
import {
  WITCHES_BOARD_PHASES,
  WitchesChoices,
  witchesOn,
  witchesPrompt,
  WitchesStats,
} from './Witches.tsx';
import {
  knightGiveWayTargets,
  PRINCES_BOARD_PHASES,
  PrincesChoices,
  princesOn,
  princesPrompt,
  princesTargets,
} from './Princes.tsx';
import {
  SOLDIERS_BOARD_PHASES,
  SoldiersActions,
  SoldiersChoices,
  soldiersOn,
  soldiersPrompt,
  soldiersTargets,
  type SoldiersMode,
} from './Soldiers.tsx';

type Mode =
  | null
  | 'road'
  | 'settlement'
  | 'city'
  | 'ship'
  | 'moveShip'
  | 'bridge'
  | 'repair'
  | 'tbMove'
  | 'wagon'
  | EpMode
  | GwpMode
  | CkMode
  | CivMode
  | ChurchMode
  | 'princesKnight'
  | SoldiersMode;
type EdgeKind = 'road' | 'ship';
type Dialog = null | 'bank' | 'offer' | 'gift' | 'yearOfPlenty' | 'monopoly';

const EVENT_ICON: Record<string, string> = {
  ship: '⛵',
  wild: '⛵✨',
  science: '🟢',
  trade: '🟡',
  politics: '🔵',
  magic: '🟣',
  religion: '🔴',
  wealth: '🟠',
  joker: '🃏',
};

/** Road or ship action types for the current step, when the step places one of them. */
function edgeChoices(state: GameState): [string, string] | null {
  const ph = state.phase.id;
  if (ph === 'setup' && (state.phase.step as string) === 'road')
    return ['placeSetupRoad', 'placeSetupShip'];
  if (ph === 'roadBuilding') return ['placeFreeRoad', 'placeFreeShip'];
  return null;
}

/** Which of road or ship the player is placing now, when both are possible. */
function edgeKindFor(state: GameState, legal: Action[], chosen: EdgeKind): EdgeKind {
  const pair = edgeChoices(state);
  if (!pair) return chosen;
  const road = legal.some((a) => a.type === pair[0]);
  const ship = legal.some((a) => a.type === pair[1]);
  if (road && !ship) return 'road';
  if (ship && !road) return 'ship';
  return chosen;
}

function targetsFor(
  state: GameState,
  legal: Action[],
  mode: Mode,
  edgeKind: EdgeKind,
  selectedShip: string | null,
  bid: { wool: number; grain: number } = { wool: 0, grain: 0 },
  neutral = 0,
): Targets {
  if (state.phase.id === 'neutralBuild') return duelTargets(legal, neutral);
  const t: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };
  if (state.phase.id === 'eventPick' || state.phase.id === 'camelVote') {
    for (const a of legal) {
      if (typeof a.edge !== 'string') continue;
      if (a.type === 'camelBid' && (a.wool !== bid.wool || a.grain !== bid.grain)) continue;
      t.edges.set(a.edge as EdgeId, a);
    }
    return t;
  }
  if (mode && EP_MODES.includes(mode)) return epTargets(state, legal, mode as EpMode, selectedShip);
  if (mode && GWP_MODES.includes(mode))
    return gwpTargets(legal, mode as GwpMode, selectedShip, state);
  if (mode && state.phase.id === 'main' && (CIV_MODES as readonly string[]).includes(mode))
    return civTargets(legal, mode as CivMode, selectedShip);
  if (state.phase.id === 'main' && isChurchMode(mode)) return churchTargets(legal, mode);
  const seat = state.phase.id === 'main' ? seatId(mode) : null;
  if (seat) {
    for (const a of legal)
      if (a.type === 'buildCitySeat' && a.seat === seat) t.corners.set(a.corner as CornerId, a);
    return t;
  }
  if (PRINCES_BOARD_PHASES.includes(state.phase.id))
    return princesTargets(state, legal, selectedShip);
  const soldiers = soldiersOn(state) ? soldiersTargets(state, legal, mode, selectedShip) : null;
  if (soldiers) return soldiers;
  if (state.phase.id === 'main' && mode === 'princesKnight') {
    t.corners = knightGiveWayTargets(state, legal);
    return t;
  }
  // Moving the robber after a knight gave way: another knight takes it further.
  if (state.phase.id === 'moveRobber' && state.phase.walk)
    t.corners = knightGiveWayTargets(state, legal);
  const want = new Set<string>();
  const ph = state.phase.id;
  const pair = edgeChoices(state);
  if (pair) want.add(edgeKind === 'ship' ? pair[1] : pair[0]);
  if (ph === 'setup' && (state.phase.step as string) !== 'road') want.add('placeSetupSettlement');
  if (ph === 'tbKnight') want.add('placeTbKnight');
  if (ph === 'tbBarbarian') {
    // Pick a barbarian (unless one was just driven off), then where it goes.
    const pick = (state.phase.from as EdgeId | null) ?? selectedShip;
    for (const a of legal) {
      if (a.type !== 'moveEdgeBarbarian') continue;
      if (pick === null)
        t.edges.set(a.from as EdgeId, { type: 'selectKnight', player: a.player, knight: a.from });
      else if (a.from === pick) t.edges.set(a.edge as EdgeId, a);
    }
    return t;
  }
  if (ph === 'main' && mode === 'wagon') {
    want.add('moveWagon');
    want.add('driveBarbarian');
  }
  if (ph === 'slayDragon') want.add('slayDragon');
  if (ph === 'civNeutral') want.add('civNeutral');
  if (ph === 'civMuscovyHex') want.add('civMuscovyHex');
  if (ph === 'civRaid') want.add('civRaidCity');
  if (ph === 'moveToken') want.add('takeToken');
  if (ph === 'moveRobber') {
    want.add('moveRobber');
    want.add('movePirate');
  }
  // Out-of-turn building (Special Building Phase) uses the same build modes.
  const building = ph === 'main' || ph === 'specialBuild';
  if (building && mode === 'road') want.add('buildRoad');
  if (building && mode === 'settlement') want.add('buildSettlement');
  if (building && mode === 'city') want.add('buildCity');
  if (building && mode === 'ship') want.add('buildShip');
  if (building && mode === 'bridge') want.add('buildBridge');
  if (state.phase.id === 'main' && mode === 'repair') want.add('repairRoad');
  const knightCorner = (id: unknown) => {
    const k = typeof id === 'string' ? state.pieces[id] : undefined;
    return k?.at.kind === 'corner' ? k.at.id : null;
  };
  if (
    CK_BOARD_PHASES.includes(ph) ||
    GWP_BOARD_PHASES.includes(ph) ||
    GWP_CARD_BOARD_PHASES.includes(ph) ||
    WITCHES_BOARD_PHASES.includes(ph)
  ) {
    for (const a of legal) {
      if (typeof a.corner === 'string') t.corners.set(a.corner as CornerId, a);
      else if (typeof a.edge === 'string') t.edges.set(a.edge as EdgeId, a);
      else if (typeof a.hex === 'string') t.hexes.set(a.hex as HexId, a);
      else {
        const c = knightCorner(a.knight);
        if (c) t.corners.set(c, a);
      }
    }
    return t;
  }
  if (ph === 'main' && (mode === 'activate' || mode === 'promote')) {
    const type = mode === 'activate' ? 'activateKnight' : 'promoteKnight';
    for (const a of legal) {
      if (a.type !== type) continue;
      const c = knightCorner(a.knight);
      if (c) t.corners.set(c, a);
    }
    return t;
  }
  if (ph === 'main' && mode === 'knightAct') {
    // First pick a knight, then where it goes (or the robber to chase).
    for (const a of legal) {
      if (
        ![
          'moveKnight',
          'displaceKnight',
          'chaseRobber',
          'crossKnight',
          'roamKnight',
          'fightDragon',
          'chaseDragon',
        ].includes(a.type)
      )
        continue;
      if (selectedShip === null) {
        const c = knightCorner(a.knight);
        if (c) t.corners.set(c, { type: 'selectKnight', player: a.player, knight: a.knight });
      } else if (a.knight === selectedShip) {
        if (a.type === 'chaseRobber') {
          const r = Object.values(state.pieces).find((p) => p.type === 'robber');
          if (r?.at.kind === 'hex') t.hexes.set(r.at.id, a);
        } else if (a.type === 'chaseDragon') {
          const dr = Object.values(state.pieces).find((p) => p.type === 'gwpDragon');
          if (dr?.at.kind === 'hex') t.hexes.set(dr.at.id, a);
        } else if (a.type === 'fightDragon') {
          // Tap the knight's own corner again to fight the dragon there.
          const c = knightCorner(a.knight);
          if (c) t.corners.set(c, a);
        } else t.corners.set(a.to as CornerId, a);
      }
    }
    return t;
  }
  if (ph === 'main' && mode === 'knight') want.add('buildKnight');
  if (ph === 'main' && mode === 'wall') want.add('buildWall');
  if (ph === 'main' && mode === 'tbMove') {
    // First pick a knight, then the path it moves to.
    const knights =
      (state.data['traders-barbarians']?.knights as { id: string; edge: EdgeId }[] | undefined) ??
      [];
    for (const a of legal) {
      if (a.type !== 'moveTbKnight') continue;
      if (selectedShip === null) {
        const k = knights.find((x) => x.id === a.knight);
        if (k) t.edges.set(k.edge, { type: 'selectKnight', player: a.player, knight: a.knight });
      } else if (a.knight === selectedShip) t.edges.set(a.to as EdgeId, a);
    }
    return t;
  }
  if (ph === 'main' && mode === 'moveShip') {
    // First pick a ship, then where it sails to.
    for (const a of legal) {
      if (a.type !== 'moveShip') continue;
      if (selectedShip === null) {
        const ship = state.pieces[a.ship as string];
        if (ship?.at.kind === 'edge')
          t.edges.set(ship.at.id, { type: 'selectShip', player: a.player, ship: a.ship });
      } else if (a.ship === selectedShip) t.edges.set(a.to as EdgeId, a);
    }
    return t;
  }
  for (const a of legal) {
    if (!want.has(a.type)) continue;
    if (typeof a.corner === 'string') t.corners.set(a.corner as CornerId, a);
    if (typeof a.edge === 'string') t.edges.set(a.edge as EdgeId, a);
    if (typeof a.hex === 'string') t.hexes.set(a.hex as HexId, a);
  }
  return t;
}

function setupNote(index: number, players: number): string {
  if (index >= 2 * players) return ' (your third, which also collects resources)';
  return index >= players ? ' (your second, which collects resources)' : '';
}

function prompt(
  state: GameState,
  actor: number | null,
  names: string[],
  mode: Mode,
  picked: string | null = null,
): string {
  const who = actor === null ? '' : names[actor];
  if (state.modules.includes('explorers-pirates')) {
    const ep = epPrompt(state, who ?? '', mode);
    if (ep) return ep;
  }
  const duel = duelPrompt(state, who ?? '');
  if (duel) return duel;
  const princes = princesPrompt(state, who ?? '', actor, picked);
  if (princes) return princes;
  const soldiers = soldiersPrompt(state, who ?? '', actor, mode, picked);
  if (soldiers) return soldiers;
  if (mode && (CIV_MODES as readonly string[]).includes(mode))
    return civModePrompt(who ?? '', mode as CivMode, picked);
  const civ = civPrompt(state, names, actor);
  if (civ) return civ;
  switch (state.phase.id) {
    case 'setup':
      return (state.phase.step as string) === 'road'
        ? `${who}: place a ${state.modules.includes('seafarers') ? 'road or ship' : 'road'} next to your new settlement.`
        : `${who}: place a settlement${setupNote(state.phase.index as number, state.players.length)}.`;
    case 'roll':
      return `${who}: roll the dice${hasKnight(state, actor) ? ', or play a Knight first' : ''}.`;
    case 'discard':
      if (!(state.phase.owed as Record<number, number>)[actor ?? -1])
        return 'Waiting for players to discard.';
      return `${who}: discard ${(state.phase.owed as Record<number, number>)[actor ?? -1]} cards.`;
    case 'moveRobber':
      return state.modules.includes('seafarers')
        ? `${who}: move the robber to a land hex, or the pirate to a sea hex.`
        : `${who}: move the robber to a new hex.`;
    case 'pickGold': {
      const owed = (state.phase.owed as Record<number, number>)[actor ?? -1];
      if (!owed) return 'Waiting for players to pick their gold.';
      return `${who}: gold! Pick ${owed} resource${owed === 1 ? '' : 's'}.`;
    }
    case 'steal':
      return `${who}: choose who to steal from.`;
    case 'slayDragon':
      return `${who}: tap a hex with a dragon to drive it out for good.`;
    case 'moveToken':
      return `${who}: the pile of numbers is empty. Tap a glowing home hex to move its number to the new island.`;
    case 'roadBuilding':
      return `${who}: place a free ${state.modules.includes('seafarers') ? 'road or ship' : 'road'} (${state.phase.remaining as number} left).`;
    case 'main':
      if (mode && GWP_MODES.includes(mode)) return gwpPrompt(who ?? '', mode, null) ?? '';
      if (isChurchMode(mode)) return churchModePrompt(who ?? '', mode);
      if (seatId(mode)) return seatPrompt(who ?? '', seatId(mode)!);
      if (mode === 'tbMove') return `${who}: ${TB_MOVE_PROMPT}`;
      if (mode === 'wagon') return `${who}: ${WAGON_PROMPT}`;
      if (mode === 'moveShip')
        return `${who}: tap the ship to move, then where it should sail. Tap the button again to cancel.`;
      if (mode === 'knightAct')
        return `${who}: tap an active knight, then where it goes. A knight next to the robber can chase it away.`;
      if (mode === 'activate' || mode === 'promote')
        return `${who}: tap the knight to ${mode}. Tap the button again to cancel.`;
      if (mode === 'knight')
        return `${who}: tap a glowing corner on your roads for a new knight. Tap the button again to cancel.`;
      if (mode === 'wall')
        return `${who}: tap one of your cities for a wall. Tap the button again to cancel.`;
      if (mode)
        return `${who}: tap a glowing spot to build a ${mode}. Tap the button again to cancel.`;
      return `${who}: trade, build, or end your turn.`;
    case 'specialBuild': {
      const q = state.phase.queue as number[];
      const builder = q[0] ?? null;
      if (builder === actor && mode)
        return `${who}: tap a glowing spot to build a ${mode}. Tap the button again to cancel.`;
      return builder === actor
        ? `${who}: special build. Build or buy, then tap Done building.`
        : `${builder === null ? '' : names[builder]} is building before the next turn.`;
    }
    case 'gameOver':
      return `${names[state.winner ?? 0]} wins!`;
    default:
      return (
        tbPrompt(state, who ?? '', actor) ??
        ckPrompt(state, who ?? '', actor) ??
        gwpPhasePrompt(state, who ?? '') ??
        wonderPrompt(state, names) ??
        gwpCardPrompt(state, who ?? '', names) ??
        churchPrompt(state, who ?? '', actor) ??
        witchesPrompt(state, who ?? '', actor) ??
        ''
      );
  }
}

function hasKnight(state: GameState, seat: number | null) {
  if (seat === null) return false;
  return (state.players[seat]?.held.dev ?? []).some(
    (c) => c.card === 'knight' && c.acquiredTurn < state.turn.number,
  );
}

/** What the game screen needs, whether the game runs on this device or online. */
export interface GameController {
  state: GameState;
  log: LogEntry[];
  act: (a: Action) => boolean;
  error: string | null;
  clearError: () => void;
  /** Seats played by bots in a game on this device. */
  bots?: Record<number, BotConfig>;
}

export interface OnlineExtras {
  code: string;
  conn: Connection;
  you: string | null;
  members: MemberInfo[];
  isHost: boolean;
  deadline: number | null;
  chat: ChatMessage[];
  sendChat: (text: string) => void;
  nudge: (seat: number) => void;
  rematch: () => void;
}

export function LocalGame({ saved, onQuit }: { saved: SavedGame; onQuit: () => void }) {
  const g = useLocalGame(saved);
  return <Game g={g} seat={g.actor} onQuit={onQuit} />;
}

export function Game({
  g,
  seat,
  online,
  onQuit,
}: {
  g: GameController;
  /** Whose hand and moves this screen shows: the device holder, or your seat online. */
  seat: number | null;
  online?: OnlineExtras;
  onQuit: () => void;
}) {
  const { state } = g;
  const theme = useTheme();
  const actor = seat;
  const names = state.players.map((p) => p.name);
  const bots = g.bots ?? {};
  const humans = state.players.filter((p) => !bots[p.seat]).length;
  // With bots at the table the screen belongs to one person, like an online seat.
  const seated = !!online || Object.keys(bots).length > 0;
  const promptNames =
    online || humans === 1 ? names.map((n, i) => (i === seat ? 'You' : n)) : names;
  const owedMe =
    state.phase.id === 'discard' && actor !== null
      ? ((state.phase.owed as Record<number, number>)[actor] ?? 0)
      : 0;
  const goldOwed =
    state.phase.id === 'pickGold' && actor !== null
      ? ((state.phase.owed as Record<number, number>)[actor] ?? 0)
      : 0;
  const owedPhase = !!state.phase.owed;
  const ck = state.modules.includes('cities-knights');
  const gwp = state.modules.includes('greed-wealth-power');
  const wonders = wondersOn(state);
  const civs = civsOn(state);
  const church = churchOn(state);
  const witches = witchesOn(state);
  const cardKinds = handCards(state.modules);
  const promptSeat = seated && !owedMe && !goldOwed && !owedPhase ? actorOf(state) : actor;
  const seafarers = state.modules.includes('seafarers');
  const tb = state.modules.includes('traders-barbarians') || state.settings.harbormaster === true;
  const tda = state.modules.includes('treasures-dragons');
  const ep = state.modules.includes('explorers-pirates');
  const [chosenEdgeKind, setEdgeKind] = useState<EdgeKind>('road');
  const [selectedShip, setSelectedShip] = useState<string | null>(null);
  const canControl = (s: number) => (!online && !bots[s]) || s === seat;
  const [chosenMode, setMode] = useState<Mode>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  // Phone layout: the controls sheet pulled up, and the header menu open.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The bid belongs to one vote; a fresh vote starts with no cards bid.
  const voteKey = `${state.turn.number}-${state.phase.id}`;
  const [bidFor, setBidFor] = useState({ key: '', wool: 0, grain: 0 });
  const camelBid = useMemo(
    () => (bidFor.key === voteKey ? bidFor : { wool: 0, grain: 0 }),
    [bidFor, voteKey],
  );
  const setCamelBid = (b: { wool: number; grain: number }) => setBidFor({ key: voteKey, ...b });
  const [rulebook, setRulebook] = useState<{ page: string | null } | null>(null);
  // Duel rules: which neutral builder gets the free piece.
  const [neutral, setNeutral] = useState(0);
  const [privateHands, setPrivateHands] = useState(false);
  const [revealedFor, setRevealedFor] = useState<number | null>(null);

  // Build mode only applies in the main phase.
  const myTurnMain = state.phase.id === 'main' && actor === state.turn.player;
  // Building out of turn: the Special Building Phase, or the partner in paired turns.
  const sbpBuilder =
    state.phase.id === 'specialBuild' ? ((state.phase.queue as number[])[0] ?? null) : null;
  const pairedPartner =
    state.phase.id === 'main' && state.settings.turnMode === 'paired'
      ? partnerOf(state.turn.player, state.players.length)
      : null;
  const outOfTurn =
    actor !== null && !myTurnMain && (sbpBuilder === actor || pairedPartner === actor);
  const mode: Mode =
    state.phase.id === 'main' || state.phase.id === 'specialBuild' || state.phase.id === 'sail'
      ? chosenMode
      : null;
  const legal = useMemo(
    () => (actor === null ? [] : library.legalActions(state, actor)),
    [state, actor],
  );
  const has = (type: string, pred: (a: Action) => boolean = () => true) =>
    legal.some((a) => a.type === type && pred(a));
  const ctx = useMemo(() => new Ctx(state, library.registry(state.modules)), [state]);
  const edgeKind = edgeKindFor(state, legal, chosenEdgeKind);
  const pair = edgeChoices(state);
  const bothEdgeKinds =
    !!pair && legal.some((a) => a.type === pair[0]) && legal.some((a) => a.type === pair[1]);
  const shipPick =
    mode === 'moveShip' ||
    mode === 'sail' ||
    (mode !== null && GWP_MODES.includes(mode)) ||
    mode === 'civHarbor' ||
    mode === 'civTiticaca' ||
    mode === 'civHarakiri' ||
    PRINCES_BOARD_PHASES.includes(state.phase.id) ||
    SOLDIERS_BOARD_PHASES.includes(state.phase.id)
      ? selectedShip
      : null;
  const targets = useMemo(
    () =>
      actor === null
        ? noTargets
        : targetsFor(state, legal, mode, edgeKind, shipPick, camelBid, neutral),
    [state, legal, mode, actor, edgeKind, shipPick, camelBid, neutral],
  );
  const eventCard = (state.data.variants?.lastEvent ?? null) as {
    event: EventId;
    total: number;
  } | null;
  const lastRoll =
    (state.data.base?.lastRoll as { dice: Record<string, number>; total: number } | undefined) ??
    null;
  const offer = baseData(ctx).trade;

  const act = (a: Action) => {
    if (a.type === 'selectShip' || a.type === 'selectKnight') {
      setSelectedShip((a.ship ?? a.knight) as string);
      return;
    }
    if (g.act(a)) {
      // A wagon moves one path at a time, ships sail one after another and spice comes a
      // sack at a time, so those modes stay on.
      if (!['moveWagon', 'sailShip', 'boostShip', 'buySpice'].includes(a.type)) setMode(null);
      setSelectedShip(null);
    }
  };

  const hiddenHand = !online && privateHands && actor !== null && revealedFor !== actor;
  const viewer = actor;

  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [g.log.length]);

  // Sounds for new log lines, and a nudge when it becomes your turn.
  const heard = useRef(g.log.length);
  useEffect(() => {
    const fresh = g.log.slice(Math.min(heard.current, g.log.length));
    heard.current = g.log.length;
    if (!fresh.length || fresh.length > 30) return;
    const sounds = new Set(fresh.map((l) => soundFor(l.event, seat)).filter((x) => x !== null));
    for (const sound of sounds) play(sound);
    if (online && fresh.some((l) => l.event.type === 'turnStarted' && l.event.player === seat))
      notifyHere('Colonizers: your turn', `It's your move in room ${online.code}.`);
  }, [g.log, seat, online]);

  // The tab title shows when it's your move, for people in another tab.
  const myMove = seat !== null && state.winner === null && library.waitingOn(state).includes(seat);
  useEffect(() => {
    if (!online) return;
    document.title = myMove ? '● Your turn · Colonizers' : 'Colonizers';
    return () => {
      document.title = 'Colonizers';
    };
  }, [myMove, online]);

  const errorPage = g.error ? pageForError(g.error, state.modules) : null;

  // Keyboard shortcuts on desktop: each button names its key in data-shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape') {
        setMode(null);
        setSelectedShip(null);
        setSheetOpen(false);
        return;
      }
      const key = e.key.toLowerCase();
      const btn = document.querySelector<HTMLButtonElement>(
        `.game [data-shortcut="${CSS.escape(key)}"]:not(:disabled)`,
      );
      if (btn) {
        e.preventDefault();
        btn.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // "Your turn" when the turn passes to someone holding this screen.
  const turnCue = (s: number): string | null => {
    if (online) return s === seat ? 'Your turn' : null;
    if (bots[s]) return null;
    return humans > 1 ? `${names[s]}'s turn` : 'Your turn';
  };

  return (
    <div className="game">
      <CardFlights log={g.log} ctx={ctx} viewer={viewer} theme={theme} turnCue={turnCue} />
      <header className="game-head">
        <h1 className="game-title brand">
          <img className="brand-mark" src="/logo.svg" alt="" width="28" height="28" />
          Colonizers
        </h1>
        <p className="prompt" aria-live="polite">
          {promptSeat !== null && (
            <PlayerBadge
              color={theme.players[promptSeat]!.color}
              shape={theme.players[promptSeat]!.shape}
            />
          )}{' '}
          {prompt(state, promptSeat, promptNames, mode, shipPick)}
          {online?.deadline && state.winner === null && <TurnTimer deadline={online.deadline} />}
        </p>
        <button
          type="button"
          className="icon menu-toggle"
          aria-expanded={menuOpen}
          aria-label="Menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
        <div className={`head-actions${menuOpen ? ' open' : ''}`}>
          {online ? (
            <span className={`conn conn-${online.conn}`} title={`Room ${online.code}`}>
              {online.conn === 'open' ? `Room ${online.code}` : 'Reconnecting…'}
            </span>
          ) : (
            <label className="toggle" title="Cover the hand when passing the device">
              <input
                type="checkbox"
                checked={privateHands}
                onChange={(e) => setPrivateHands(e.target.checked)}
              />{' '}
              Private hands
            </label>
          )}
          <SoundToggle />
          <ThemePicker compact />
          <DicePicker compact />
          <MotionPicker compact />
          <button
            type="button"
            className="icon help"
            onClick={() => setRulebook({ page: null })}
            aria-label="Open rulebook"
          >
            ?
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (
                online ||
                window.confirm(
                  'Leave this game? It stays saved on this device until you start a new one.',
                )
              )
                onQuit();
            }}
          >
            {online ? 'Home' : 'Menu'}
          </button>
        </div>
      </header>

      <aside className="players" aria-label="Players">
        {state.players.map((p) => {
          const t = theme.players[p.seat]!;
          const data = baseData(ctx);
          const member = online?.members.find((m) => m.seat === p.seat);
          const waitingOnThem =
            online &&
            p.seat !== seat &&
            state.winner === null &&
            (state.phase.owed
              ? !!(state.phase.owed as Record<number, number>)[p.seat]
              : state.turn.player === p.seat);
          return (
            <div
              key={p.seat}
              data-seat={p.seat}
              className={`player${state.turn.player === p.seat ? ' active' : ''}`}
              style={{ borderColor: t.color }}
            >
              <div className="player-name">
                <PlayerBadge color={t.color} shape={t.shape} />
                <strong>{p.name}</strong>
                {online && (
                  <span
                    className={`presence${member?.online ? ' on' : ''}`}
                    title={member?.online ? 'Online' : 'Offline'}
                    aria-label={member?.online ? 'Online' : 'Offline'}
                  />
                )}
                {p.seat === seat && (online || humans === 1) && (
                  <small className="muted">you</small>
                )}
                {(member?.bot ?? bots[p.seat]) && (
                  <span title={`${(member?.bot ?? bots[p.seat])!.level} bot`} aria-label="Bot">
                    🤖
                  </span>
                )}
                <span key={publicVp(ctx, p.seat)} className="vp" title="Victory points">
                  {publicVp(ctx, p.seat)}
                  <small> VP</small>
                </span>
              </div>
              <div className="player-stats">
                <span title="Cards in hand">🂠 {ctx.handSize(p.seat, false)}</span>
                {civs && <CivStats ctx={ctx} seat={p.seat} />}
                {wonders && <WonderStats ctx={ctx} seat={p.seat} />}
                {ck ? (
                  <>
                    <CkPlayerStats ctx={ctx} seat={p.seat} />
                    {gwp && <GwpPlayerStats ctx={ctx} seat={p.seat} />}
                    {church && <ChurchStats ctx={ctx} seat={p.seat} />}
                    {witches && <WitchesStats ctx={ctx} seat={p.seat} />}
                  </>
                ) : ep ? (
                  <EpPlayerStats ctx={ctx} seat={p.seat} />
                ) : (
                  <>
                    <span title="Development cards">📜 {p.held.dev?.length ?? 0}</span>
                    <span title="Knights played">⚔️ {p.played.knight ?? 0}</span>
                  </>
                )}
                {tb && <TbPlayerStats ctx={ctx} seat={p.seat} viewer={seat ?? actor} />}
                {tda && <TdaPlayerStats ctx={ctx} seat={p.seat} />}
                <DuelStats ctx={ctx} seat={p.seat} />
                <span title="Longest road">🛣️ {ctx.longestRoute(p.seat)}</span>
                {data.longestRoad === p.seat && (
                  <span className="award">
                    {seafarers ? 'Longest Trade Route' : 'Longest Road'}
                  </span>
                )}
                {data.largestArmy === p.seat && <span className="award">Largest Army</span>}
                {waitingOnThem && (
                  <button
                    type="button"
                    className="small ghost"
                    onClick={() => online.nudge(p.seat)}
                    title={`Remind ${p.name} it's their move`}
                  >
                    👋 Nudge
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {ck && <BarbarianTrack ctx={ctx} />}
        {tda && <TdaStatus ctx={ctx} />}
        {ep && <EpStatus ctx={ctx} />}
      </aside>

      <main className="board-wrap">
        <ZoomPane>
          <Board
            state={state}
            targets={targets}
            onAction={act}
            rolled={state.phase.id === 'main' ? lastRoll?.total : null}
          />
        </ZoomPane>
        {lastRoll && (
          <DiceTray
            dice={lastRoll.dice}
            rollKey={`${state.turn.number}-${lastRoll.total}-${JSON.stringify(lastRoll.dice)}`}
            icons={EVENT_ICON}
            faces={state.settings.ckEventFaces as string[] | undefined}
          >
            {state.settings.eventCards === true && eventCard && (
              <span className="event-card" title="Event card">
                {EVENT_NAME[eventCard.event]}
              </span>
            )}
          </DiceTray>
        )}
      </main>

      <section className={`controls${sheetOpen ? ' open' : ''}`} aria-label="Your turn">
        <button
          type="button"
          className="sheet-handle"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(!sheetOpen)}
        >
          {sheetOpen ? '▼ Less' : '▲ Hand, log and more'}
        </button>
        {g.error && (
          <div className="error" role="alert">
            {g.error}
            {errorPage && (
              <button
                type="button"
                className="link"
                onClick={() => setRulebook({ page: errorPage })}
              >
                See the rule
              </button>
            )}
            <button type="button" className="icon" onClick={g.clearError} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        {actor !== null && (
          <div className="hand">
            <div className="hand-head">
              <strong>{online || humans === 1 ? 'Your hand' : `${names[actor]}'s hand`}</strong>
              {hiddenHand && (
                <button type="button" onClick={() => setRevealedFor(actor)}>
                  Show my cards
                </button>
              )}
            </div>
            {!hiddenHand && (
              <>
                <div className="hand-cards">
                  {RESOURCES.map((r) => (
                    <ResourceCard
                      key={r}
                      card={r}
                      count={state.players[actor]!.hand[r] ?? 0}
                      dim={!state.players[actor]!.hand[r]}
                    />
                  ))}
                  {ck && (
                    <CommodityCards
                      hand={state.players[actor]!.hand}
                      extra={fanCommodities(state.modules)}
                    />
                  )}
                  {ep && (
                    <ResourceCard
                      card="gold"
                      count={state.players[actor]!.hand.gold ?? 0}
                      dim={!state.players[actor]!.hand.gold}
                    />
                  )}
                </div>
                {ck && (
                  <ProgressHand
                    state={state}
                    actor={actor}
                    legal={legal}
                    act={act}
                    names={promptNames}
                  />
                )}
                <div className="dev-cards">
                  {(state.players[actor]!.held.dev ?? []).map((c, i) => {
                    const card = c.card;
                    const playable =
                      card === 'yearOfPlenty' || card === 'monopoly'
                        ? has('playDevCard', (a) => a.card === card)
                        : has('playDevCard', (a) => a.card === card);
                    const isNew = c.acquiredTurn === state.turn.number;
                    return (
                      <button
                        key={i}
                        type="button"
                        className="dev"
                        disabled={!playable}
                        title={isNew ? 'Bought this turn' : undefined}
                        onClick={() => {
                          if (card === 'yearOfPlenty') setDialog('yearOfPlenty');
                          else if (card === 'monopoly') setDialog('monopoly');
                          else act({ type: 'playDevCard', player: actor, card });
                        }}
                      >
                        {nameOf(card).icon} {nameOf(card).name}
                        {isNew && <small> (new)</small>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <div className="actions">
          {bothEdgeKinds && (
            <div className="row" role="group" aria-label="Place a road or a ship">
              {(['road', 'ship'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={edgeKind === k ? 'on' : ''}
                  aria-pressed={edgeKind === k}
                  onClick={() => setEdgeKind(k)}
                >
                  {k === 'road' ? '🛣️ Road' : '⛵ Ship'}
                </button>
              ))}
            </div>
          )}
          <PrincesChoices state={state} legal={legal} act={act} />
          <SoldiersChoices state={state} legal={legal} act={act} actor={actor} />
          {has('ckDone') && CK_BOARD_PHASES.includes(state.phase.id) && (
            <button type="button" onClick={() => act({ type: 'ckDone', player: actor! })}>
              Done
            </button>
          )}
          {has('camelBid') && actor !== null && (
            <CamelBidPanel hand={state.players[actor]!.hand} bid={camelBid} setBid={setCamelBid} />
          )}
          {has('roll') && (
            <button
              type="button"
              className="primary"
              onClick={() => act({ type: 'roll', player: actor! })}
              data-shortcut="r"
              title="Roll (R)"
            >
              🎲 Roll
            </button>
          )}
          {gwp && state.phase.id === 'moveRobber' && actor === state.turn.player && (
            <GwpDragonChoice
              actor={actor}
              legal={legal}
              act={act}
              mode={mode}
              setMode={(m) => {
                setSelectedShip(null);
                setMode(m);
              }}
            />
          )}
          {actor !== null &&
            actor === state.turn.player &&
            (state.phase.id === 'neutralBuild' || myTurnMain) && (
              <DuelActions
                ctx={ctx}
                actor={actor}
                legal={legal}
                act={act}
                neutral={neutral}
                setNeutral={setNeutral}
              />
            )}
          {wonders && !myTurnMain && <WonderPanel ctx={ctx} actor={null} legal={[]} act={act} />}
          {civs && !myTurnMain && <CivPanel ctx={ctx} actor={actor} legal={[]} act={act} />}
          {ep &&
            (state.phase.id === 'sail' || (state.phase.id === 'campaign' && soldiersOn(state))) &&
            actor === state.turn.player && (
              <EpActions
                ctx={ctx}
                actor={actor}
                legal={legal}
                act={act}
                mode={mode}
                setMode={(m) => {
                  setSelectedShip(null);
                  setMode(m);
                }}
                selectedShip={mode === 'sail' ? selectedShip : null}
              />
            )}
          {(myTurnMain || outOfTurn) && actor !== null && (
            <>
              {outOfTurn && (
                <span className="muted small">
                  {sbpBuilder === actor ? 'Special build:' : 'Partner build:'}
                </span>
              )}
              {(ep
                ? (['road', 'settlement'] as const)
                : (['road', 'settlement', 'city'] as const)
              ).map((m) => {
                const type =
                  m === 'road' ? 'buildRoad' : m === 'settlement' ? 'buildSettlement' : 'buildCity';
                return (
                  <button
                    key={m}
                    type="button"
                    className={mode === m ? 'on' : ''}
                    disabled={!has(type)}
                    onClick={() => setMode(mode === m ? null : m)}
                    aria-pressed={mode === m}
                    data-shortcut={m === 'road' ? 'd' : m === 'settlement' ? 's' : 'c'}
                    title={`${m === 'road' ? 'Road (D)' : m === 'settlement' ? 'Settlement (S)' : 'City (C)'}`}
                  >
                    {m === 'road' ? 'Road' : m === 'settlement' ? 'Settlement' : 'City'}{' '}
                    <CostLine cost={ctx.cost(m, actor)} />
                  </button>
                );
              })}
              {ck && myTurnMain && (
                <CkBuild
                  ctx={ctx}
                  actor={actor}
                  has={has}
                  mode={
                    mode === null ||
                    ['knight', 'activate', 'promote', 'knightAct', 'wall'].includes(mode)
                      ? (mode as CkMode | null)
                      : null
                  }
                  setMode={(m) => {
                    setSelectedShip(null);
                    setMode(m);
                  }}
                  onImprove={(track) => act({ type: 'improveCity', player: actor, track })}
                />
              )}
              {wonders && myTurnMain && (
                <WonderPanel ctx={ctx} actor={actor} legal={legal} act={act} />
              )}
              {civs && myTurnMain && (
                <CivPanel
                  ctx={ctx}
                  actor={actor}
                  legal={legal}
                  act={act}
                  setMode={(m) => {
                    setSelectedShip(null);
                    setMode(m);
                  }}
                />
              )}
              {church && myTurnMain && (
                <ChurchActions
                  ctx={ctx}
                  actor={actor}
                  legal={legal}
                  act={act}
                  mode={mode}
                  setMode={(m) => {
                    setSelectedShip(null);
                    setMode(m);
                  }}
                />
              )}
              {gwp && myTurnMain && (
                <GwpActions
                  ctx={ctx}
                  actor={actor}
                  legal={legal}
                  act={act}
                  mode={mode}
                  setMode={(m) => {
                    setSelectedShip(null);
                    setMode(m);
                  }}
                />
              )}
              {seafarers && (
                <>
                  <button
                    type="button"
                    className={mode === 'ship' ? 'on' : ''}
                    disabled={!has('buildShip')}
                    onClick={() => setMode(mode === 'ship' ? null : 'ship')}
                    aria-pressed={mode === 'ship'}
                  >
                    Ship <CostLine cost={ctx.cost('ship', actor)} />
                  </button>
                  {myTurnMain && (
                    <button
                      type="button"
                      className={mode === 'moveShip' ? 'on' : ''}
                      disabled={!has('moveShip')}
                      onClick={() => {
                        setSelectedShip(null);
                        setMode(mode === 'moveShip' ? null : 'moveShip');
                      }}
                      aria-pressed={mode === 'moveShip'}
                    >
                      ⛵ Move ship
                    </button>
                  )}
                </>
              )}
              {myTurnMain && has('repairRoad') && (
                <button
                  type="button"
                  className={mode === 'repair' ? 'on' : ''}
                  aria-pressed={mode === 'repair'}
                  onClick={() => setMode(mode === 'repair' ? null : 'repair')}
                >
                  🔧 Repair road <CostLine cost={ctx.cost('road', actor)} />
                </button>
              )}
              {state.modules.includes('traders-barbarians') && myTurnMain && (
                <TbActions
                  ctx={ctx}
                  actor={actor}
                  legal={legal}
                  act={act}
                  names={promptNames}
                  bridgeMode={mode === 'bridge'}
                  toggleBridge={() => setMode(mode === 'bridge' ? null : 'bridge')}
                  knightMode={mode === 'tbMove' || mode === 'wagon'}
                  toggleKnight={() => {
                    const m = state.settings.tbScenario === 'traders' ? 'wagon' : 'tbMove';
                    setSelectedShip(null);
                    setMode(mode === m ? null : m);
                  }}
                />
              )}
              {ep && myTurnMain && (
                <EpActions
                  ctx={ctx}
                  actor={actor}
                  legal={legal}
                  act={act}
                  mode={mode}
                  setMode={(m) => {
                    setSelectedShip(null);
                    setMode(m);
                  }}
                  selectedShip={mode === 'sail' ? selectedShip : null}
                />
              )}
              {princesOn(state) && (ck || soldiersOn(state)) && myTurnMain && (
                <button
                  type="button"
                  className={mode === 'princesKnight' ? 'on' : ''}
                  aria-pressed={mode === 'princesKnight'}
                  disabled={!has('knightRobberMove') && !has('unitRobberMove')}
                  onClick={() => setMode(mode === 'princesKnight' ? null : 'princesKnight')}
                  title={
                    soldiersOn(state)
                      ? 'An army gives way (its best unit a level down, or an infantry off the board) to move the robber'
                      : 'A knight gives way (a level down, or off the board) to move the robber'
                  }
                >
                  {soldiersOn(state) ? '⚔️' : '🛡️'} Move robber
                </button>
              )}
              {princesOn(state) && !ck && !soldiersOn(state) && myTurnMain && (
                <button
                  type="button"
                  disabled={!has('buyRobberMove')}
                  onClick={() => act({ type: 'buyRobberMove', player: actor })}
                  title="Move the robber one to three fields without a 7"
                >
                  Move robber <CostLine cost={ctx.cost('robberMove', actor)} />
                </button>
              )}
              {soldiersOn(state) && myTurnMain && (
                <SoldiersActions
                  ctx={ctx}
                  actor={actor}
                  legal={legal}
                  act={act}
                  mode={mode}
                  setMode={(m) => {
                    setSelectedShip(null);
                    setMode(m);
                  }}
                />
              )}
              {!ck && !ep && !princesOn(state) && !soldiersOn(state) && (
                <button
                  type="button"
                  disabled={!has('buyDevCard')}
                  onClick={() => act({ type: 'buyDevCard', player: actor })}
                >
                  Dev card <CostLine cost={ctx.cost('devCard', actor)} />
                </button>
              )}
              {(myTurnMain || pairedPartner === actor) && (
                <button
                  type="button"
                  disabled={!has('bankTrade')}
                  onClick={() => setDialog('bank')}
                  data-shortcut="b"
                  title="Bank trade (B)"
                >
                  Bank trade
                </button>
              )}
              {myTurnMain && (
                <button
                  type="button"
                  disabled={!!offer}
                  onClick={() => setDialog('offer')}
                  data-shortcut="t"
                  title="Offer trade (T)"
                >
                  Offer trade
                </button>
              )}
              {myTurnMain && state.settings.gifting === true && (
                <button type="button" onClick={() => setDialog('gift')}>
                  🎁 Gift
                </button>
              )}
              {myTurnMain && (
                <button
                  type="button"
                  className="primary"
                  disabled={!has('endTurn')}
                  onClick={() => act({ type: 'endTurn', player: actor })}
                  data-shortcut="e"
                  title="End turn (E)"
                >
                  End turn
                </button>
              )}
              {sbpBuilder === actor && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => act({ type: 'endSpecialBuild', player: actor })}
                >
                  Done building
                </button>
              )}
            </>
          )}
        </div>

        {offer && (
          <div className="offer">
            <p>
              <strong>{names[offer.from]}</strong> offers <CostLine cost={offer.give} /> for{' '}
              <CostLine cost={offer.get} />
            </p>
            <ul className="responses">
              {state.players
                .filter((p) => p.seat !== offer.from && (!offer.to || offer.to.includes(p.seat)))
                .map((p) => {
                  const r = offer.responses[p.seat];
                  const mine = canControl(p.seat);
                  const canAccept =
                    library.check(state, {
                      type: 'respondTrade',
                      player: p.seat,
                      offer: offer.id,
                      accept: true,
                    }) === null;
                  return (
                    <li key={p.seat}>
                      <PlayerBadge
                        color={theme.players[p.seat]!.color}
                        shape={theme.players[p.seat]!.shape}
                      />{' '}
                      {p.name}:{' '}
                      {r === 'accept' ? (
                        <>
                          accepts{' '}
                          {canControl(offer.from) && (
                            <button
                              type="button"
                              className="primary small"
                              onClick={() =>
                                act({
                                  type: 'confirmTrade',
                                  player: offer.from,
                                  offer: offer.id,
                                  with: p.seat,
                                })
                              }
                            >
                              Trade with {p.name}
                            </button>
                          )}
                        </>
                      ) : r === 'decline' ? (
                        'declines'
                      ) : !mine ? (
                        'thinking…'
                      ) : (
                        <>
                          <button
                            type="button"
                            className="small"
                            disabled={!canAccept}
                            onClick={() =>
                              act({
                                type: 'respondTrade',
                                player: p.seat,
                                offer: offer.id,
                                accept: true,
                              })
                            }
                          >
                            Accept
                          </button>{' '}
                          <button
                            type="button"
                            className="small ghost"
                            onClick={() =>
                              act({
                                type: 'respondTrade',
                                player: p.seat,
                                offer: offer.id,
                                accept: false,
                              })
                            }
                          >
                            Decline
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
            </ul>
            {canControl(offer.from) && (
              <button
                type="button"
                className="ghost small"
                onClick={() => act({ type: 'cancelTrade', player: offer.from })}
              >
                Withdraw offer
              </button>
            )}
          </div>
        )}

        <details className="log-wrap" open>
          <summary>Game log</summary>
          <ol className="log" ref={logRef}>
            {g.log.map((l, i) => {
              const text = describe(l.event, names);
              if (!text) return null;
              return (
                <li key={i} className={l.event.type === 'turnStarted' ? 'turn-line' : ''}>
                  {text}
                </li>
              );
            })}
          </ol>
        </details>
        {online && (
          <Chat
            messages={online.chat}
            you={online.you}
            members={online.members}
            onSend={online.sendChat}
          />
        )}
      </section>

      {owedMe > 0 && actor !== null && (
        <DiscardDialog
          key={actor}
          name={names[actor]!}
          hand={state.players[actor]!.hand}
          owed={(state.phase.owed as Record<number, number>)[actor]!}
          cards={cardKinds}
          onDiscard={(cards) => act({ type: 'discard', player: actor, cards })}
          plays={legal.filter((a) => a.type === 'playProgress')}
          onPlay={act}
        />
      )}

      {state.phase.id === 'giveBack' && actor !== null && state.phase.player === actor && (
        <GiveBackDialog
          key={`${actor}-${state.seq}`}
          name={online || humans === 1 ? 'You' : names[actor]!}
          hand={state.players[actor]!.hand}
          count={state.phase.count as number}
          onGive={(cards) => act({ type: 'giveBack', player: actor, cards })}
        />
      )}

      {goldOwed > 0 && actor !== null && (
        <GoldDialog
          key={`${actor}-${state.seq}`}
          name={online || humans === 1 ? 'You' : names[actor]!}
          owed={Math.min(
            goldOwed,
            RESOURCES.reduce((sum, r) => sum + (state.bank[r] ?? 0), 0),
          )}
          bank={state.bank}
          onPick={(cards) => act({ type: 'pickGold', player: actor, cards })}
        />
      )}

      {actor !== null && (
        <EventPickDialog state={state} legal={legal} act={act} names={promptNames} />
      )}

      {ck && actor !== null && (
        <CkChoices state={state} actor={actor} legal={legal} act={act} names={promptNames} />
      )}
      {wonders && actor !== null && (
        <WonderChoices state={state} ctx={ctx} actor={actor} legal={legal} act={act} />
      )}
      {civs && actor !== null && (
        <CivChoices state={state} ctx={ctx} actor={actor} legal={legal} act={act} />
      )}
      {ck && actor !== null && (
        <GwpChoices state={state} legal={legal} act={act} names={promptNames} />
      )}
      {church && actor !== null && (
        <ChurchChoices state={state} legal={legal} act={act} names={promptNames} />
      )}
      {witches && actor !== null && (
        <WitchesChoices state={state} legal={legal} act={act} names={promptNames} />
      )}

      {state.phase.id === 'steal' && legal.some((a) => a.type === 'steal') && (
        <Modal title="Steal a card">
          <p>Pick a player to steal one random card from.</p>
          <div className="row">
            {legal
              .filter((a) => a.type === 'steal')
              .map((a) => (
                <button key={a.from as number} type="button" onClick={() => act(a)}>
                  {names[a.from as number]} ({ctx.handSize(a.from as number, false)} cards)
                </button>
              ))}
          </div>
        </Modal>
      )}

      {dialog === 'bank' && actor !== null && (
        <BankDialog
          cards={cardKinds}
          legal={legal.filter((a) => a.type === 'bankTrade')}
          ratio={(card) => ctx.reduce('tradeRatio', actor, card, 4)}
          onTrade={(a) => act(a)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'gift' && actor !== null && (
        <GiftDialog
          cards={cardKinds}
          hand={state.players[actor]!.hand}
          players={state.players
            .filter((p) => p.seat !== actor)
            .map((p) => ({ seat: p.seat, name: p.name }))}
          onGive={(to, cards) => {
            if (g.act({ type: 'giveCards', player: actor, to, cards })) setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'offer' && actor !== null && (
        <OfferDialog
          cards={cardKinds}
          hand={state.players[actor]!.hand}
          onOffer={(give, get) => {
            if (g.act({ type: 'offerTrade', player: actor, give, get })) setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog === 'yearOfPlenty' || dialog === 'monopoly') && actor !== null && (
        <PickDialog
          kind={dialog}
          onPick={(picked) => {
            const ok =
              dialog === 'monopoly'
                ? g.act({
                    type: 'playDevCard',
                    player: actor,
                    card: 'monopoly',
                    resource: picked[0],
                  })
                : g.act({
                    type: 'playDevCard',
                    player: actor,
                    card: 'yearOfPlenty',
                    resources: picked,
                  });
            if (ok) setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {hiddenHand && state.phase.id !== 'gameOver' && (
        <div className="pass-cover">
          <div>
            <PlayerBadge
              color={theme.players[actor]!.color}
              shape={theme.players[actor]!.shape}
              size={40}
            />
            <h2>Pass to {names[actor]}</h2>
            <button type="button" className="primary" onClick={() => setRevealedFor(actor)}>
              I'm {names[actor]}
            </button>
          </div>
        </div>
      )}

      {state.winner !== null && (
        <Modal title="Game over">
          <h3>🏆 {names[state.winner]} wins!</h3>
          <ol className="scores">
            {[...state.players]
              .sort((a, b) => ctx.vp(b.seat) - ctx.vp(a.seat))
              .map((p) => (
                <li key={p.seat}>
                  {p.name}: {ctx.vp(p.seat)} VP
                </li>
              ))}
          </ol>
          {online ? (
            <div className="row">
              {online.isHost && (
                <button type="button" className="primary" onClick={online.rematch}>
                  Back to the lobby
                </button>
              )}
              <button
                type="button"
                className={online.isHost ? 'ghost' : 'primary'}
                onClick={onQuit}
              >
                Home
              </button>
              {!online.isHost && <p className="muted">The host can set up the next game.</p>}
            </div>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => {
                clearSavedGame();
                onQuit();
              }}
            >
              New game
            </button>
          )}
        </Modal>
      )}

      {rulebook && (
        <Rulebook
          state={state}
          viewer={viewer}
          initialPage={rulebook.page}
          onClose={() => setRulebook(null)}
        />
      )}
    </div>
  );
}

function GoldDialog({
  name,
  owed,
  bank,
  onPick,
}: {
  name: string;
  owed: number;
  bank: Record<string, number>;
  onPick: (c: Record<string, number>) => void;
}) {
  const [pick, setPick] = useState<Record<string, number>>({});
  return (
    <Modal title={`${name}: gold!`}>
      <p>
        A gold field paid out. Choose {owed} resource{owed === 1 ? '' : 's'} from the bank.
      </p>
      <CardPicker value={pick} onChange={setPick} max={bank} label="Resources to take" />
      <button
        type="button"
        className="primary"
        disabled={total(pick) !== owed}
        onClick={() => onPick(clean(pick))}
      >
        Take {total(pick)}/{owed}
      </button>
    </Modal>
  );
}

function DiscardDialog({
  name,
  hand,
  owed,
  cards,
  onDiscard,
  plays = [],
  onPlay,
}: {
  name: string;
  hand: Record<string, number>;
  owed: number;
  cards: readonly string[];
  onDiscard: (c: Record<string, number>) => void;
  /** Progress cards for this moment (Small Dragon). */
  plays?: Action[];
  onPlay?: (a: Action) => void;
}) {
  const [pick, setPick] = useState<Record<string, number>>({});
  return (
    <Modal title={`${name}: discard ${owed}`}>
      <p>You hold too many cards (or a Saboteur struck). Choose {owed} to give back.</p>
      <CardPicker
        value={pick}
        onChange={setPick}
        max={hand}
        label="Cards to discard"
        cards={cards}
      />
      <button
        type="button"
        className="primary"
        disabled={total(pick) !== owed}
        onClick={() => onDiscard(clean(pick))}
      >
        Discard {total(pick)}/{owed}
      </button>
      {plays.length > 0 && onPlay && (
        <div className="row wrap">
          <small>Or play:</small>
          {plays.map((a, i) => (
            <button key={i} type="button" onClick={() => onPlay(a)}>
              {nameOf(a.card as string).icon} {nameOf(a.card as string).name}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function BankDialog({
  cards,
  legal,
  ratio,
  onTrade,
  onClose,
}: {
  cards: readonly string[];
  legal: Action[];
  ratio: (card: string) => number;
  onTrade: (a: Action) => void;
  onClose: () => void;
}) {
  const [give, setGive] = useState<string | null>(null);
  const gives = [...new Set(legal.map((a) => a.give as string))];
  return (
    <Modal title="Trade with the bank" onClose={onClose}>
      <p>Give:</p>
      <div className="row">
        {cards.map((r) => (
          <button
            key={r}
            type="button"
            className={give === r ? 'on' : ''}
            disabled={!gives.includes(r)}
            onClick={() => setGive(r)}
          >
            {ratio(r)} × <ResourceCard card={r} />
          </button>
        ))}
      </div>
      {give && (
        <>
          <p>Get one:</p>
          <div className="row">
            {legal
              .filter((a) => a.give === give)
              .map((a) => (
                <button key={a.get as string} type="button" onClick={() => onTrade(a)}>
                  <ResourceCard card={a.get as string} />
                </button>
              ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function OfferDialog({
  cards,
  hand,
  onOffer,
  onClose,
}: {
  cards: readonly string[];
  hand: Record<string, number>;
  onOffer: (give: Record<string, number>, get: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [give, setGive] = useState<Record<string, number>>({});
  const [get, setGet] = useState<Record<string, number>>({});
  return (
    <Modal title="Offer a trade" onClose={onClose}>
      <div className="two-col">
        <div>
          <h3>You give</h3>
          <CardPicker
            value={give}
            onChange={setGive}
            max={hand}
            label="Cards you give"
            cards={cards}
          />
        </div>
        <div>
          <h3>You get</h3>
          <CardPicker value={get} onChange={setGet} label="Cards you want" cards={cards} />
        </div>
      </div>
      <button
        type="button"
        className="primary"
        disabled={!total(give) || !total(get)}
        onClick={() => onOffer(clean(give), clean(get))}
      >
        Offer to everyone
      </button>
    </Modal>
  );
}

function GiftDialog({
  cards,
  hand,
  players,
  onGive,
  onClose,
}: {
  cards: readonly string[];
  hand: Record<string, number>;
  players: { seat: number; name: string }[];
  onGive: (to: number, cards: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [to, setTo] = useState(players[0]?.seat ?? 0);
  const [give, setGive] = useState<Record<string, number>>({});
  return (
    <Modal title="Give a gift" onClose={onClose}>
      <label>
        To{' '}
        <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
          {players.map((p) => (
            <option key={p.seat} value={p.seat}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <CardPicker value={give} onChange={setGive} max={hand} label="Cards to give" cards={cards} />
      <button
        type="button"
        className="primary"
        disabled={!total(give)}
        onClick={() => onGive(to, clean(give))}
      >
        Give
      </button>
    </Modal>
  );
}

function PickDialog({
  kind,
  onPick,
  onClose,
}: {
  kind: 'yearOfPlenty' | 'monopoly';
  onPick: (r: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const need = kind === 'monopoly' ? 1 : 2;
  return (
    <Modal
      title={kind === 'monopoly' ? 'Monopoly: name a resource' : 'Year of Plenty: take two'}
      onClose={onClose}
    >
      <div className="row">
        {RESOURCES.map((r) => (
          <button
            key={r}
            type="button"
            disabled={picked.length >= need}
            onClick={() => setPicked([...picked, r])}
          >
            <ResourceCard card={r} />
          </button>
        ))}
      </div>
      <p>
        Chosen: {picked.map((r) => nameOf(r).icon).join(' ') || 'none'}{' '}
        {picked.length > 0 && (
          <button type="button" className="link" onClick={() => setPicked([])}>
            Clear
          </button>
        )}
      </p>
      <button
        type="button"
        className="primary"
        disabled={picked.length !== need}
        onClick={() => onPick(picked)}
      >
        Play card
      </button>
    </Modal>
  );
}

function SoundToggle() {
  const on = useSound();
  return (
    <button
      type="button"
      className="icon"
      onClick={() => setSound(!on)}
      aria-pressed={on}
      aria-label={on ? 'Sound on' : 'Sound off'}
      title={on ? 'Sound on' : 'Sound off'}
    >
      {on ? '🔊' : '🔇'}
    </button>
  );
}
