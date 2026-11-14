import { useState } from 'react';
import {
  cornerHexes,
  type Action,
  type CornerId,
  type Ctx,
  type EdgeId,
  type GameState,
} from '@colonizers/engine';
import {
  churchView,
  debtOf,
  FESTIVAL_COST,
  festivalsOf,
  type FestivalKind,
} from '@colonizers/module-church';
import { nameOf } from '@colonizers/rulebook';
import type { Targets } from '../board/Board.tsx';
import { CostLine, ResourceCard } from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';

/** Church, Faith & Reformation on screen: the Diocese, festivals, debts and the Religion cards. */

export const churchOn = (state: GameState) => state.modules.includes('church');

export const CHURCH_MODES = ['festival'] as const;
export type ChurchMode = (typeof CHURCH_MODES)[number];
export const isChurchMode = (m: string | null): m is ChurchMode =>
  m !== null && (CHURCH_MODES as readonly string[]).includes(m);

/** Bread and Beer, for the hand row. */
export const CHURCH_HAND = ['bread', 'beer'] as const;

const KIND_NAME: Record<FestivalKind, string> = {
  road: 'road',
  ship: 'ship',
  knight: 'knight',
  settlement: 'settlement',
  city: 'city',
};

const TRACK_NAME: Record<string, string> = {
  science: 'Science',
  trade: 'Trade',
  politics: 'Politics',
  magic: 'Magic',
  religion: 'Religion',
};

/** Board targets for holding a festival. */
export function churchTargets(legal: Action[], mode: ChurchMode): Targets {
  const t: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };
  for (const a of legal) {
    if (mode === 'festival' && a.type === 'holdFestival') {
      const at = a.at as string;
      if (at.startsWith('e:')) t.edges.set(at as EdgeId, a);
      else t.corners.set(at as CornerId, a);
    }
  }
  return t;
}

export function churchModePrompt(who: string, mode: ChurchMode): string {
  return mode === 'festival'
    ? `${who}: tap a rival's road, ship, knight, settlement or city to hold a festival there. It stops until your next turn.`
    : '';
}

/** Prompts for the steps the Religion cards add. */
export function churchPrompt(state: GameState, who: string, actor: number | null): string | null {
  switch (state.phase.id) {
    case 'churchTax': {
      const owed = (state.phase.owed as Record<number, number>)[actor ?? -1];
      return owed
        ? `${who}: Church Tax. Give ${state.players[state.phase.by as number]?.name ?? 'them'} a resource of your choice.`
        : 'Waiting for players to pay the Church Tax.';
    }
    default:
      return null;
  }
}

const card = (c: unknown) =>
  typeof c === 'string' ? `${nameOf(c).icon ?? ''} ${nameOf(c).name}`.trim() : '';

const cardsText = (cards: Record<string, number>) =>
  Object.entries(cards)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${n} ${nameOf(c).name.toLowerCase()}`)
    .join(', ');

/** "Bea's city near 6, 9". */
function cityLabel(state: GameState | undefined, corner: unknown): string {
  if (!state || typeof corner !== 'string') return 'A city';
  const b = Object.values(state.pieces).find(
    (p) => p.at.kind === 'corner' && p.at.id === corner && p.type === 'city',
  );
  const owner = b?.owner === null || b?.owner === undefined ? '' : state.players[b.owner]?.name;
  const near = cornerHexes(corner as CornerId)
    .map((h) => state.hexes[h]?.token)
    .filter((t): t is number => typeof t === 'number');
  const where = near.length ? ` near ${[...new Set(near)].sort((a, b) => a - b).join(', ')}` : '';
  return `${owner ? `City of ${owner}` : 'City'}${where}`;
}

/** Labels for the Religion cards' choices, or null for anything else. */
export function churchOptionLabel(a: Action, names: string[], state?: GameState): string | null {
  const n = (s: unknown) => (typeof s === 'number' ? (names[s] ?? `Player ${s + 1}`) : '');
  switch (a.type) {
    case 'churchTaxPay':
      return card(a.card);
    case 'pickJoker':
      return `${TRACK_NAME[a.deck as string] ?? String(a.deck)} gate`;
    case 'playProgress':
      break;
    default:
      return null;
  }
  switch (a.card) {
    case 'inquisitor':
      return cityLabel(state, a.option);
    case 'anathema':
      return `${n(a.target)}: ${TRACK_NAME[a.option as string] ?? ''}, until they pay ${cardsText(a.cards as Record<string, number>)}`;
    default:
      return null;
  }
}

/** A player's church troubles, for the player list. */
export function ChurchStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const v = churchView(ctx);
  const bans = (v.bans ?? []).filter((b) => b.target === seat);
  const hosting = festivalsOf(ctx).find((f) => f.by === seat);
  const inquisitor = v.inquisitor ? ctx.buildingAt(v.inquisitor)?.owner === seat : false;
  return (
    <>
      {hosting && (
        <span
          title={`Holding a festival on a ${KIND_NAME[hosting.kind]} of ${ctx.state.players[hosting.target]?.name}`}
        >
          🍻
        </span>
      )}
      {v.lent?.target === seat && (
        <span title={`Lent: no building until they pay ${cardsText(v.lent.owed)}`}>✝️ Lent</span>
      )}
      {bans.map((b) => (
        <span
          key={b.track}
          title={`Anathema: ${TRACK_NAME[b.track]} is shut until they pay ${cardsText(b.owed)}`}
        >
          ⛔ {TRACK_NAME[b.track]}
        </span>
      ))}
      {inquisitor && <span title="The Inquisitor is at their city: no level 3 abilities">👁️</span>}
    </>
  );
}

/** On your turn: festivals, and paying off Lent or Anathema. */
export function ChurchActions({
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
  setMode: (m: ChurchMode | null) => void;
}) {
  const has = (type: string) => legal.some((a) => a.type === type);
  const toggle = (m: ChurchMode) => setMode(mode === m ? null : m);
  const beer = ctx.player(actor).hand.beer ?? 0;
  const pays = legal.filter((a) => a.type === 'churchPay');
  const debts = [...new Set(pays.map((a) => a.debt as string))];
  return (
    <>
      <button
        type="button"
        className={mode === 'festival' ? 'on' : ''}
        aria-pressed={mode === 'festival'}
        disabled={!has('holdFestival')}
        onClick={() => toggle('festival')}
        title={`You have ${beer} Beer. Shut down a rival piece until your next turn: road or ship ${FESTIVAL_COST.road}, knight ${FESTIVAL_COST.knight}, settlement ${FESTIVAL_COST.settlement}, city ${FESTIVAL_COST.city} Beer`}
      >
        🍻 Festival
      </button>
      {debts.map((debt) => {
        const owed = debtOf(ctx, actor, debt) ?? {};
        return (
          <span key={debt} className="row" role="group" aria-label={`Pay off ${debt}`}>
            <small>{debt === 'lent' ? '✝️ Lent: pay' : `⛔ ${TRACK_NAME[debt]}: pay`}</small>
            {pays
              .filter((a) => a.debt === debt)
              .map((a) => (
                <button
                  key={a.card as string}
                  type="button"
                  onClick={() => act(a)}
                  title={`Owed: ${cardsText(owed)}`}
                >
                  <ResourceCard card={a.card as string} count={owed[a.card as string] ?? 0} />
                </button>
              ))}
          </span>
        );
      })}
    </>
  );
}

/** Dialogs the Religion cards open: paying the Church Tax. */
export function ChurchChoices({
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
  const list = (type: string, title: string, text: string) => {
    const opts = legal.filter((a) => a.type === type);
    if (!opts.length) return null;
    return (
      <Modal title={title}>
        <p>{text}</p>
        <div className="row wrap">
          {opts.map((a, i) => (
            <button key={i} type="button" onClick={() => act(a)}>
              {churchOptionLabel(a, names, state)}
            </button>
          ))}
        </div>
      </Modal>
    );
  };
  switch (state.phase.id) {
    case 'churchTax':
      return list(
        'churchTaxPay',
        nameOf('churchTax').name,
        `Give ${names[state.phase.by as number] ?? 'them'} one resource of your choice.`,
      );
    default:
      return null;
  }
}

/**
 * Anathema in steps: the player, the track, then the three resources they
 * must pay (only ones their buildings can make).
 */
export function AnathemaDialog({
  options,
  names,
  act,
  onClose,
}: {
  options: Action[];
  names: string[];
  act: (a: Action) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const seats = [...new Set(options.map((a) => a.target as number))];
  const forTarget = options.filter((a) => a.target === target);
  const tracks = [...new Set(forTarget.map((a) => a.option as string))];
  const pick = target !== null ? (track ?? (tracks.length === 1 ? tracks[0]! : null)) : null;
  const final = forTarget.filter((a) => a.option === pick);
  return (
    <Modal title={nameOf('anathema').name} onClose={onClose}>
      {target === null ? (
        <>
          <p>Who do you place under the ban?</p>
          <div className="row wrap">
            {seats.map((s) => (
              <button key={s} type="button" onClick={() => setTarget(s)}>
                {names[s] ?? `Player ${s + 1}`}
              </button>
            ))}
          </div>
        </>
      ) : pick === null ? (
        <>
          <p>Which track do you shut?</p>
          <div className="row wrap">
            {tracks.map((t) => (
              <button key={t} type="button" onClick={() => setTrack(t)}>
                {TRACK_NAME[t] ?? t}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>
            {names[target]} must pay you these three resources to lift the ban on {TRACK_NAME[pick]}
            .
          </p>
          <div className="row wrap">
            {final.map((a, i) => (
              <button key={i} type="button" onClick={() => act(a)}>
                <CostLine cost={a.cards as Record<string, number>} />
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/** What the board shows: the Inquisitor and festival chips. */
export function churchMarkers(state: GameState): {
  key: string;
  at: string;
  icon: string;
  owner: number | null;
  title: string;
  /** Above the spot (-1), on it (0) or above to the right (1), so markers on one city don't overlap. */
  slot: -1 | 0 | 1;
}[] {
  const v = state.data.church as
    | {
        festivals?: { by: number; target: number; at: string; kind: FestivalKind }[];
        inquisitor?: CornerId | null;
      }
    | undefined;
  if (!v) return [];
  const name = (s: number) => state.players[s]?.name ?? `Player ${s + 1}`;
  return [
    ...(v.festivals ?? []).map((f) => ({
      key: `festival-${f.by}`,
      at: f.at,
      icon: '🍻',
      slot: 0 as const,
      owner: f.by,
      title: `Festival held by ${name(f.by)}: this ${KIND_NAME[f.kind]} stops until their next turn`,
    })),
    ...(v.inquisitor
      ? [
          {
            key: 'inquisitor',
            at: v.inquisitor,
            icon: '👁️',
            slot: 1 as const,
            owner: null,
            title: 'The Inquisitor: this city’s owner has no level 3 abilities',
          },
        ]
      : []),
  ];
}
