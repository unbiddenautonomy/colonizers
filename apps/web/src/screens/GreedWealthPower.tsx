import { useState } from 'react';
import {
  cornerHexes,
  type Action,
  type CornerId,
  type Ctx,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import {
  beerOf,
  beerRatio,
  BUILDINGS,
  buildingsOf,
  FESTIVALS,
  festivals,
  GWP_COMMODITIES,
  heroes,
  NEUTRAL_NAMES,
  neutralPiece,
  NEUTRALS,
  type Building,
  type Neutral,
} from '@colonizers/module-greed-wealth-power';
import { nameOf } from '@colonizers/rulebook';
import type { Targets } from '../board/Board.tsx';
import { CostLine, ResourceCard } from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';

/** Board modes for Greed, Wealth & Power: one per building, and Beer for a knight. */
export type GwpMode = Building | 'beerKnight' | 'dragon';
export const GWP_MODES: readonly string[] = [...BUILDINGS, 'beerKnight', 'dragon'];

export const GWP_ICON: Record<Building, string> = {
  citadel: '🏰',
  diocese: '⛪',
  monument: '🗿',
  silo: '🌾',
};

const LABEL: Record<Building, string> = {
  citadel: 'Citadel',
  diocese: 'Diocese',
  monument: 'Monument',
  silo: 'Silo',
};

const WHERE: Record<Building, string> = {
  citadel: 'brick hex',
  diocese: 'grain hex',
  monument: 'gold field',
  silo: 'grain hex',
};

export function gwpOn(state: GameState): boolean {
  return state.modules.includes('greed-wealth-power');
}

export const NEUTRAL_ICON: Record<Neutral, string> = {
  duke: '🎖️',
  scholar: '📜',
  wizard: '🧙',
  inquisitor: '⚖️',
  envoy: '💼',
};

/** Beer, buildings, neutral pieces and a Hero of Catan card, for one player's row. */
export function GwpPlayerStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const mine = buildingsOf(ctx, seat);
  const built = BUILDINGS.filter((b) => mine[b]);
  const held = NEUTRALS.filter((n) => neutralPiece(ctx, n)?.owner === seat);
  const hero = heroes(ctx).includes(seat);
  const party = festivals(ctx).filter((f) => f.target === seat);
  const slayer =
    (ctx.state.data['greed-wealth-power']?.slayer as number | null | undefined) === seat;
  return (
    <>
      <span title="Beer">🍺 {beerOf(ctx, seat)}</span>
      {built.length > 0 && (
        <span title={built.map((b) => LABEL[b]).join(', ')}>
          {built.map((b) => GWP_ICON[b]).join('')}
        </span>
      )}
      {held.length > 0 && (
        <span title={`${held.map((n) => NEUTRAL_NAMES[n]).join(', ')}: 1 point each`}>
          {held.map((n) => NEUTRAL_ICON[n]).join('')}
        </span>
      )}
      {hero && <span title="Hero of Catan: 1 point">🦸</span>}
      {slayer && <span title="Dragon Slayer: 2 points">🗡️</span>}
      {party.map((f, i) => (
        <span
          key={i}
          title={`${FESTIVALS[f.kind].name} from ${ctx.state.players[f.by]?.name ?? ''}: ${FESTIVAL_TEXT[f.kind].toLowerCase()}`}
        >
          🍻
        </span>
      ))}
    </>
  );
}

/** Where each neutral piece sits on its hex, as a share of the hex size. */
const NEUTRAL_SPOT: Record<Neutral | 'gwpDragon' | 'damsel', [number, number]> = {
  gwpDragon: [-0.52, -0.3],
  damsel: [0.52, -0.3],
  duke: [-0.28, -0.5],
  scholar: [0, -0.56],
  wizard: [0.28, -0.5],
  inquisitor: [-0.2, 0.54],
  envoy: [0.2, 0.54],
};

/** The neutral pieces on the board, for drawing. */
export function neutralMarkers(state: GameState): {
  id: string;
  hex: HexId;
  owner: number | null;
  icon: string;
  label: string;
  dx: number;
  dy: number;
}[] {
  const out = [];
  for (const p of Object.values(state.pieces)) {
    if (p.at.kind !== 'hex') continue;
    if (p.type === 'gwpDragon' || p.type === 'damsel') {
      const dragon = p.type === 'gwpDragon';
      const [dx, dy] = dragon && p.props.lair ? [0, 0] : NEUTRAL_SPOT[p.type];
      out.push({
        id: p.id,
        hex: p.at.id,
        owner: null,
        icon: dragon ? '🐉' : '👸',
        label: dragon
          ? p.props.lair
            ? 'The dragon, in its lair: only a mighty knight can drive it out'
            : 'The dragon: this hex makes nothing'
          : 'The Damsel: no building beside her; cities here are safe from the barbarians',
        dx,
        dy,
      });
      continue;
    }
    if (!(NEUTRALS as readonly string[]).includes(p.type)) continue;
    const n = p.type as Neutral;
    const [dx, dy] = NEUTRAL_SPOT[n];
    let label = NEUTRAL_NAMES[n];
    if (n === 'inquisitor' && typeof p.props.target === 'number')
      label += ` (watching ${state.players[p.props.target]?.name ?? 'a player'})`;
    out.push({ id: p.id, hex: p.at.id, owner: p.owner, icon: NEUTRAL_ICON[n], label, dx, dy });
  }
  return out;
}

/** Placing a neutral piece: tap its hex. */
export const GWP_BOARD_PHASES = ['placeNeutral', 'placeDamsel'];

export function gwpPhasePrompt(state: GameState, who: string): string | null {
  if (state.phase.id === 'placeDamsel') return `${who}: doubles! Put the Damsel on any land hex.`;
  if (state.phase.id !== 'placeNeutral') return null;
  const n = state.phase.piece as Neutral;
  const where: Record<Neutral, string> = {
    duke: 'any land hex',
    scholar: 'a hex beside one of your cities',
    wizard: 'a hex beside your settlement or city',
    inquisitor: `a hex beside a settlement or city of ${state.players[state.phase.target as number]?.name ?? 'that player'}`,
    envoy: 'a hex beside another player’s city',
  };
  return `${who}: put the ${NEUTRAL_NAMES[n]} on ${where[n]}.`;
}

/**
 * What can be tapped in a Greed, Wealth & Power mode. For a building: first
 * the city (when it could go on more than one hex), then the hex.
 */
export function gwpTargets(
  legal: Action[],
  mode: GwpMode,
  picked: string | null,
  state: GameState,
): Targets {
  const t: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };
  if (mode === 'dragon') {
    for (const a of legal)
      if (a.type === 'moveDragon' && typeof a.hex === 'string') t.hexes.set(a.hex as HexId, a);
    return t;
  }
  if (mode === 'beerKnight') {
    for (const a of legal) {
      if (a.type !== 'beerKnight') continue;
      const k = state.pieces[a.knight as string];
      if (k?.at.kind === 'corner') t.corners.set(k.at.id, a);
    }
    return t;
  }
  const opts = legal.filter((a) => a.type === 'buildGwp' && a.building === mode);
  const byCorner = new Map<CornerId, Action[]>();
  for (const a of opts) {
    const list = byCorner.get(a.corner as CornerId) ?? [];
    list.push(a);
    byCorner.set(a.corner as CornerId, list);
  }
  if (picked && byCorner.has(picked as CornerId)) {
    for (const a of byCorner.get(picked as CornerId) ?? []) t.hexes.set(a.hex as HexId, a);
    return t;
  }
  for (const [corner, list] of byCorner) {
    t.corners.set(
      corner,
      list.length === 1
        ? (list[0] as Action)
        : { type: 'selectKnight', player: list[0]!.player, knight: corner },
    );
  }
  return t;
}

export function gwpPrompt(who: string, mode: string | null, picked: string | null): string | null {
  if (mode === 'dragon')
    return `${who}: tap a hex beside a knight for the dragon. Tap the button again to move the robber.`;
  if (mode === 'beerKnight')
    return `${who}: tap any inactive knight to switch it on for 1 Beer. Tap the button again to cancel.`;
  if (mode && (BUILDINGS as readonly string[]).includes(mode)) {
    const b = mode as Building;
    return picked
      ? `${who}: tap the ${WHERE[b]} for your ${LABEL[b]}.`
      : `${who}: tap the city for your ${LABEL[b]} (then the ${WHERE[b]}, if it touches more than one). Tap the button again to cancel.`;
  }
  return null;
}

const FESTIVAL_TEXT: Record<keyof typeof FESTIVALS, string> = {
  roads: 'No roads',
  ships: 'No ships',
  knights: 'No new knights',
  activation: 'No activating knights',
  settlements: 'Settlements make nothing',
  cities: 'No city improvements',
};

/** Buttons for the buildings and Beer, on your turn. */
export function GwpActions({
  ctx,
  actor,
  legal,
  act,
  mode,
  setMode,
}: {
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  mode: string | null;
  setMode: (m: GwpMode | null) => void;
}) {
  const [beerOpen, setBeerOpen] = useState(false);
  const [festivalOpen, setFestivalOpen] = useState(false);
  const parties = legal.filter((a) => a.type === 'startFestival');
  const mine = buildingsOf(ctx, actor);
  const beer = beerOf(ctx, actor);
  const can = (b: Building) => legal.some((a) => a.type === 'buildGwp' && a.building === b);
  const trades = legal.filter((a) => a.type === 'beerTrade');
  return (
    <>
      {BUILDINGS.filter((b) => !mine[b]).map((b) => (
        <button
          key={b}
          type="button"
          className={mode === b ? 'on' : ''}
          aria-pressed={mode === b}
          disabled={!can(b)}
          onClick={() => setMode(mode === b ? null : b)}
          title={`${LABEL[b]}: on a ${WHERE[b]} beside one of your cities`}
        >
          {GWP_ICON[b]} {LABEL[b]} <CostLine cost={ctx.cost(b, actor)} />
        </button>
      ))}
      <button
        type="button"
        className={mode === 'beerKnight' ? 'on' : ''}
        aria-pressed={mode === 'beerKnight'}
        disabled={!legal.some((a) => a.type === 'beerKnight')}
        onClick={() => setMode(mode === 'beerKnight' ? null : 'beerKnight')}
        title="Switch on any knight for 1 Beer"
      >
        🍺 Knight
      </button>
      {legal.some((a) => a.type === 'payLent') && (
        <button type="button" onClick={() => act({ type: 'payLent', player: actor })}>
          ✝️ Pay Lent (1 wool, 1 grain) to build
        </button>
      )}
      <button type="button" disabled={!parties.length} onClick={() => setFestivalOpen(true)}>
        🍻 Beer festival
      </button>
      {festivalOpen && (
        <Modal title="Beer festival" onClose={() => setFestivalOpen(false)}>
          <p>
            You have {beer} Beer. A festival ties up one player until your next roll is worked out.
          </p>
          {(Object.keys(FESTIVALS) as (keyof typeof FESTIVALS)[]).map((kind) => {
            const opts = parties.filter((a) => a.kind === kind);
            if (!opts.length) return null;
            return (
              <div key={kind} className="row">
                <span>
                  {FESTIVAL_TEXT[kind]} ({FESTIVALS[kind].cost} 🍺):
                </span>
                {opts.map((a) => (
                  <button
                    key={a.target as number}
                    type="button"
                    onClick={() => {
                      act(a);
                      setFestivalOpen(false);
                    }}
                  >
                    {ctx.state.players[a.target as number]?.name}
                  </button>
                ))}
              </div>
            );
          })}
        </Modal>
      )}
      <button type="button" disabled={!trades.length} onClick={() => setBeerOpen(true)}>
        🍺 Beer for commodities ({beer})
      </button>
      {beerOpen && (
        <Modal title="Beer for commodities" onClose={() => setBeerOpen(false)}>
          <p>
            You have {beer} Beer. The bank gives 1 commodity for {beerRatio(ctx, actor)} Beer.
          </p>
          <div className="row">
            {trades.map((a) => (
              <button
                key={a.get as string}
                type="button"
                onClick={() => {
                  act(a);
                  if (beer - beerRatio(ctx, actor) < beerRatio(ctx, actor)) setBeerOpen(false);
                }}
              >
                <ResourceCard card={a.get as string} />
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** The GWP commodities, for the hand row. */
export const GWP_HAND = GWP_COMMODITIES;

/** Small markers for the special buildings, drawn on the hex beside their city. */
export function buildingMarkers(state: GameState): {
  key: string;
  corner: CornerId;
  hex: HexId;
  owner: number;
  building: Building;
  label: string;
}[] {
  const d = state.data['greed-wealth-power'] as
    | { buildings?: Record<number, Partial<Record<Building, { corner: CornerId; hex: HexId }>>> }
    | undefined;
  const out: {
    key: string;
    corner: CornerId;
    hex: HexId;
    owner: number;
    building: Building;
    label: string;
  }[] = [];
  for (const [seat, mine] of Object.entries(d?.buildings ?? {}))
    for (const b of BUILDINGS) {
      const at = mine[b];
      if (at)
        out.push({
          key: `${seat}-${b}`,
          corner: at.corner,
          hex: at.hex,
          owner: Number(seat),
          building: b,
          label: `${nameOf(b).name}`,
        });
    }
  return out;
}

const KNIGHT_NAME: Record<string, string> = {
  knight1: 'Basic knight',
  knight2: 'Strong knight',
  knight3: 'Mighty knight',
};

/** "Spot near 6, 9": a corner named by the numbers beside it. */
function spotLabel(state: GameState | undefined, corner: unknown): string {
  if (!state || typeof corner !== 'string') return 'A spot';
  const near = cornerHexes(corner as CornerId)
    .map((h) => state.hexes[h]?.token)
    .filter((t): t is number => typeof t === 'number');
  return near.length
    ? `Spot near ${[...new Set(near)].sort((a, b) => a - b).join(', ')}`
    : 'A spot';
}

const DIE_NAME: Record<string, string> = { red: 'red', yellow: 'yellow', event: 'event die' };

/** Land Deeds on the board: a wall standing on an empty settlement spot. */
export function deedMarkers(state: GameState): { corner: CornerId; owner: number }[] {
  const d = state.data['greed-wealth-power'] as { deeds?: Record<number, CornerId> } | undefined;
  return Object.entries(d?.deeds ?? {}).map(([seat, corner]) => ({ corner, owner: Number(seat) }));
}

/** "Strong knight by 6, 9": a knight named by the numbers beside it. */
function knightLabel(state: GameState | undefined, id: unknown): string {
  const k = typeof id === 'string' ? state?.pieces[id] : undefined;
  if (!state || !k || k.at.kind !== 'corner') return 'A knight';
  const near = cornerHexes(k.at.id)
    .map((h) => state.hexes[h]?.token)
    .filter((t): t is number => typeof t === 'number');
  const name = KNIGHT_NAME[k.type] ?? 'Knight';
  return near.length ? `${name} near ${[...new Set(near)].sort((a, b) => a - b).join(', ')}` : name;
}

const TRACK_NAME: Record<string, string> = {
  science: 'Science',
  trade: 'Trade',
  politics: 'Politics',
  magic: 'Magic',
  religion: 'Religion',
  wealth: 'Wealth',
};

const card = (c: unknown) =>
  typeof c === 'string' ? `${nameOf(c).icon ?? ''} ${nameOf(c).name}`.trim() : '';

/** Labels for Greed, Wealth & Power choices, or null for anything else. */
export function gwpOptionLabel(a: Action, names: string[], state?: GameState): string | null {
  const n = (s: unknown) => (typeof s === 'number' ? (names[s] ?? `Player ${s + 1}`) : '');
  switch (a.type) {
    case 'brothelAnswer':
      return a.pay ? `Pay 1 ${card(a.pay)}` : 'Refuse: my knights stand down';
    case 'ritualGive':
    case 'espionageTake':
      return card(a.card);
    case 'passIndulgence':
      return 'Let the roll stand';
    case 'keepProgress': {
      const pool = (state?.phase.pool as { card: string }[] | undefined) ?? [];
      return card(pool[a.index as number]?.card);
    }
    case 'playProgress':
      break;
    default:
      return null;
  }
  switch (a.card) {
    case 'kontor': {
      const [res, ratio] = String(a.option).split(':');
      return res === 'any' ? `${ratio}:1 harbor` : `${card(res)} ${ratio ?? 2}:1 harbor`;
    }
    case 'secretSociety':
      return `${n(a.target)}: ${TRACK_NAME[a.option as string] ?? String(a.option)}`;
    case 'astrolabe':
      return a.option === 'build' ? 'A Citadel or Diocese for 1 brick' : `Take ${card('paper')}`;
    case 'magicCurrent':
      return a.option === 'back' ? 'Barbarians 2 back' : 'Barbarians 2 forward';
    case 'ravenFlight':
      return a.option === 'desert'
        ? 'Robber to the desert'
        : a.option === 'festival'
          ? 'Stop a Beer festival'
          : 'Everyone else discards 1 grain';
    case 'stoneCircle':
      return a.option === 'ore'
        ? `Give ${card(a.resource)}, take 3 ore`
        : `Remove ${knightLabel(state, a.knight).toLowerCase()}: ${card(a.resource)} + ${card('bread')}`;
    case 'magicForest':
      return a.option === 'collect'
        ? 'Lumber for each settlement by a forest'
        : `2 lumber for ${card('crystal')}`;
    case 'reformation':
      return a.option === 'mine' ? 'Swap my own cards' : 'Everyone else swaps theirs';
    case 'missionary':
      return `${n(a.target)}: give ${card(a.resource)}`;
    case 'tournament':
      return knightLabel(state, a.knight);
    case 'indulgence':
      return `Throw ${String(a.option)
        .split('+')
        .map((d) => DIE_NAME[d] ?? d)
        .join(' + ')} again`;
    case 'landDeed':
      return spotLabel(state, a.option);
    case 'unicornMagic':
      return a.face === 'ship'
        ? 'Ship'
        : a.face === 'wild'
          ? 'Ship and wild gate'
          : `${TRACK_NAME[a.face as string] ?? String(a.face)} gate`;
    default:
      return null;
  }
}

/** Choices that Greed, Wealth & Power's cards ask for, in a dialog. */
export function GwpChoices({
  state,
  legal,
  act,
  names,
}: {
  state: GameState;
  legal: Action[];
  act: (a: Action) => void;
  names: string[];
}) {
  const list = (types: string[], title: string, text: string) => {
    const opts = legal.filter((a) => types.includes(a.type));
    if (!opts.length) return null;
    return (
      <Modal title={title}>
        <p>{text}</p>
        <div className="row">
          {opts.map((a, i) => (
            <button key={i} type="button" onClick={() => act(a)}>
              {gwpOptionLabel(a, names, state) ?? a.type}
            </button>
          ))}
        </div>
      </Modal>
    );
  };
  const by = names[state.phase.by as number] ?? 'A player';
  switch (state.phase.id) {
    case 'brothel':
      return list(
        ['brothelAnswer'],
        'Brothel',
        `${by} wants 1 grain, bread or Beer. If you refuse, all your knights stand down.`,
      );
    case 'magicRitual':
      return list(['ritualGive'], 'Magic Ritual', `Give ${by} one of your progress cards.`);
    case 'keepProgress':
      return list(
        ['keepProgress'],
        'Keep one',
        'Keep one of these cards. The rest go under their decks.',
      );
    case 'espionage':
      return list(['espionageTake'], 'Espionage', 'The top card of each deck. Take one.');
    case 'indulgence': {
      const r = state.phase.roll as { red: number; yellow: number; event: string };
      return list(
        ['playProgress', 'passIndulgence'],
        'Indulgence',
        `${names[state.phase.roller as number] ?? 'A player'} rolled red ${r.red}, yellow ${r.yellow} and ${EVENT_NAME[r.event] ?? r.event} on the event die. Play your Indulgence to throw some of the dice again (the new throw is final), or let the roll stand.`,
      );
    }
    default:
      return null;
  }
}

const EVENT_NAME: Record<string, string> = {
  ship: 'the ship',
  wild: 'the ship and wild gate',
  science: 'the Science gate',
  trade: 'the Trade gate',
  politics: 'the Politics gate',
  magic: 'the Magic gate',
  religion: 'the Religion gate',
  wealth: 'the Wealth gate',
};

/** Board phases from the new cards: Summoning (a road, ship or knight) and River Naiad (two hexes). */
export const GWP_CARD_BOARD_PHASES = ['summoning', 'riverNaiad'];

export function gwpCardPrompt(state: GameState, who: string, names: string[]): string | null {
  const by = names[state.phase.by as number] ?? 'A player';
  switch (state.phase.id) {
    case 'summoning':
      return `${who}: pick an open road or ship, or an inactive knight, of ${names[state.phase.target as number] ?? 'theirs'} to remove.`;
    case 'riverNaiad':
      return state.phase.first
        ? `${who}: now pick any other hex with a number to swap with.`
        : `${who}: pick a grain hex whose number you want to swap.`;
    case 'brothel':
      return `${by} played the Brothel: waiting for an answer.`;
    case 'magicRitual':
      return `${by} played Magic Ritual: waiting for progress cards.`;
    case 'keepProgress':
      return `${by} is keeping one card.`;
    case 'espionage':
      return `${who}: take the top card of one deck.`;
    case 'indulgence':
      return `${names[state.phase.roller as number] ?? 'A player'} rolled. Waiting on anyone who wants to play an Indulgence.`;
    default:
      return null;
  }
}

/** On a 7 after the first attack: move the dragon instead of the robber, or take it off. */
export function GwpDragonChoice({
  actor,
  legal,
  act,
  mode,
  setMode,
}: {
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  mode: string | null;
  setMode: (m: GwpMode | null) => void;
}) {
  const moves = legal.filter((a) => a.type === 'moveDragon');
  if (!moves.length) return null;
  const off = moves.find((a) => a.hex === null);
  return (
    <>
      <button
        type="button"
        className={mode === 'dragon' ? 'on' : ''}
        aria-pressed={mode === 'dragon'}
        disabled={!moves.some((a) => a.hex !== null)}
        onClick={() => setMode(mode === 'dragon' ? null : 'dragon')}
      >
        🐉 Move the dragon instead
      </button>
      {off && (
        <button type="button" onClick={() => act({ type: 'moveDragon', player: actor, hex: null })}>
          🐉 Take the dragon off the board
        </button>
      )}
    </>
  );
}
