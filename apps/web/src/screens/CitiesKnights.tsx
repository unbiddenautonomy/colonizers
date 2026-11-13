import { useState } from 'react';
import type { Action, Ctx, GameState } from '@colonizers/engine';
import {
  barbarianStrength,
  barbarianTrack,
  ckData,
  defenseStrength,
  improveCost,
  levels,
  MAX_LEVEL,
  progressHeld,
  strength,
  TRACK_COMMODITY,
  TRACKS,
  wallsOf,
  type Track,
} from '@colonizers/module-cities-knights';
import { nameOf } from '@colonizers/rulebook';
import { TRACK_COLOR } from '../theme/clean.ts';
import { CardPicker, clean, CostLine, handCards, ResourceCard, total } from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';

export type CkMode = 'knight' | 'activate' | 'promote' | 'knightAct' | 'wall';

export const TRACK_LABEL: Record<Track, string> = {
  science: 'Science',
  trade: 'Trade',
  politics: 'Politics',
};

/** Phases where the player picks a spot on the board. */
export const CK_BOARD_PHASES = [
  'loseCity',
  'placeMetropolis',
  'relocateKnight',
  'freeWall',
  'inventor',
  'medicine',
  'smith',
  'placeMerchant',
  'bishop',
  'diplomat',
  'intrigue',
  'desertKnight',
  'placeDeserter',
];

export function ckPrompt(state: GameState, who: string, actor: number | null): string | null {
  const owed = (state.phase.owed as Record<number, number> | undefined)?.[actor ?? -1];
  switch (state.phase.id) {
    case 'loseCity':
      return owed
        ? `${who}: the barbarians won. Pick a city to fall back to a settlement.`
        : 'The barbarians won. Waiting for the weakest defenders to give up a city.';
    case 'defenderPick':
      return owed
        ? `${who}: you tied as best defender. Pick a progress deck to draw from.`
        : 'Waiting for the best defenders to pick a progress card.';
    case 'treasureProgress':
      return owed
        ? `${who}: your treasure is a progress card. Pick a deck to draw from.`
        : 'Waiting for a treasure finder to pick a progress card.';
    case 'aqueduct':
      return owed
        ? `${who}: your aqueduct pays out. Pick any resource.`
        : 'Waiting for players with an aqueduct to pick a resource.';
    case 'placeMetropolis':
      return owed ? `${who}: pick the city for your new metropolis.` : 'Placing a metropolis…';
    case 'relocateKnight':
      return owed
        ? `${who}: your knight was pushed away. Pick a free corner on your roads.`
        : 'Waiting for a pushed-away knight to find a new corner.';
    case 'freeWall':
      return `${who}: pick a city for a free city wall.`;
    case 'inventor':
      return state.phase.first
        ? `${who}: pick the second number to swap.`
        : `${who}: pick a number to swap (not 2, 12, 6 or 8).`;
    case 'medicine':
      return `${who}: pick a settlement to upgrade for 2 ore and 1 grain.`;
    case 'smith':
      return `${who}: promote up to ${state.phase.remaining as number} knight(s) for free.`;
    case 'commercialHarbor':
      if (state.phase.pending !== undefined)
        return owed
          ? `${who}: you were given a resource. Pick a commodity to give back.`
          : 'Waiting for them to pick a commodity to give back.';
      return `${who}: offer resources for commodities.`;
    case 'progressDiscard':
      return owed
        ? `${who}: you hold too many progress cards. Put one back under its deck.`
        : 'Waiting for a player to put back a progress card.';
    case 'masterMerchant':
      return `${who}: take ${state.phase.take as number} card(s).`;
    case 'placeMerchant':
      return `${who}: place the merchant on a hex next to your settlement or city.`;
    case 'bishop':
      return `${who}: move the robber and take a card from everyone beside it.`;
    case 'diplomat':
      return `${who}: pick an open road to remove.`;
    case 'intrigue':
      return `${who}: pick a rival knight on your roads to push away.`;
    case 'desertKnight':
      return owed
        ? `${who}: pick one of your knights to desert.`
        : 'Waiting for a knight to desert.';
    case 'placeDeserter':
      return `${who}: place the deserting knight on one of your roads.`;
    case 'spy':
      return `${who}: take one progress card, or none.`;
    case 'wedding':
      return owed
        ? `${who}: give ${owed} card(s) as a wedding gift.`
        : 'Waiting for wedding gifts.';
    default:
      return null;
  }
}

/** One line for an action in a list of choices. */
export function optionLabel(a: Action, names: string[]): string {
  const n = (s: unknown) => (typeof s === 'number' ? (names[s] ?? `Player ${s + 1}`) : '');
  const card = (c: unknown) =>
    typeof c === 'string' ? `${nameOf(c).icon ?? ''} ${nameOf(c).name}`.trim() : '';
  switch (a.type) {
    case 'pickDefenderCard':
    case 'treasureProgress':
      return `${TRACK_LABEL[a.deck as Track]} deck`;
    case 'aqueductPick':
      return card(a.card);
    case 'harborSwap':
      return `Give ${n(a.with)} ${card(a.give)}`;
    case 'harborGive':
      return card(a.commodity);
    case 'returnProgress':
      return card(a.card);
    case 'takeProgress':
      return card(a.card);
    case 'playProgress':
      if (typeof a.target === 'number') return n(a.target);
      if (typeof a.resource === 'string') return card(a.resource);
      return card(a.card);
    case 'ckDone':
      return 'Done';
    default:
      return a.type;
  }
}

export function BarbarianTrack({ ctx }: { ctx: Ctx }) {
  const d = ckData(ctx);
  const len = barbarianTrack(ctx);
  const cities = barbarianStrength(ctx);
  const knights = defenseStrength(ctx);
  return (
    <div className="barbarians" aria-label="Barbarians">
      <div className="barb-track">
        {Array.from({ length: len + 1 }, (_, i) => (
          <span
            key={i}
            className={`barb-step${i === d.barbarian ? ' here' : ''}${i === len ? ' land' : ''}`}
            title={i === len ? 'Catan: the attack lands here' : `Step ${i}`}
          >
            {i === d.barbarian ? '⛵' : i === len ? '🏰' : ''}
          </span>
        ))}
      </div>
      <p className="barb-score">
        Barbarians <strong>{cities}</strong> vs knights <strong>{knights}</strong>
        {!d.robberActive && <small className="muted"> · robber waits for the first attack</small>}
      </p>
    </div>
  );
}

export function CkPlayerStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const lv = levels(ctx, seat);
  const d = ckData(ctx);
  return (
    <>
      {TRACKS.map((t) => (
        <span key={t} title={`${TRACK_LABEL[t]} level`} className="track-chip">
          <span className="track-dot" style={{ background: TRACK_COLOR[t] }} />
          {lv[t]}
          {d.metropolis[t]?.seat === seat && <span title="Metropolis">🏛️</span>}
        </span>
      ))}
      <span title="Active knight strength">🛡️ {strength(ctx, seat)}</span>
      <span title="City walls">🧱 {wallsOf(ctx, seat)}</span>
      <span title="Progress cards">📜 {progressHeld(ctx, seat).length}</span>
      {(d.defender[seat] ?? 0) > 0 && <span className="award">Defender ×{d.defender[seat]}</span>}
    </>
  );
}

export function CkBuild({
  ctx,
  actor,
  has,
  mode,
  setMode,
  onImprove,
}: {
  ctx: Ctx;
  actor: number;
  has: (type: string, pred?: (a: Action) => boolean) => boolean;
  mode: CkMode | null;
  setMode: (m: CkMode | null) => void;
  onImprove: (t: Track) => void;
}) {
  const toggle = (m: CkMode) => setMode(mode === m ? null : m);
  const btn = (
    m: CkMode,
    label: string,
    type: string | string[],
    cost?: Record<string, number>,
  ) => {
    const types = Array.isArray(type) ? type : [type];
    return (
      <button
        type="button"
        className={mode === m ? 'on' : ''}
        aria-pressed={mode === m}
        disabled={!types.some((t) => has(t))}
        onClick={() => toggle(m)}
      >
        {label} {cost && <CostLine cost={cost} />}
      </button>
    );
  };
  const lv = levels(ctx, actor);
  return (
    <>
      {btn('knight', 'Knight', 'buildKnight', ctx.cost('knight', actor))}
      {btn('activate', 'Activate', 'activateKnight', ctx.cost('activate', actor))}
      {btn('promote', 'Promote', 'promoteKnight', ctx.cost('promote', actor))}
      {btn('knightAct', '⚔️ Use knight', [
        'moveKnight',
        'displaceKnight',
        'chaseRobber',
        'crossKnight',
        'roamKnight',
        'fightDragon',
      ])}
      {btn('wall', 'City wall', 'buildWall', ctx.cost('wall', actor))}
      <div className="improve" role="group" aria-label="City improvements">
        {TRACKS.map((t) => (
          <button
            key={t}
            type="button"
            className="improve-btn"
            style={{ borderColor: TRACK_COLOR[t] }}
            disabled={!has('improveCity', (a) => a.track === t)}
            onClick={() => onImprove(t)}
            title={`${TRACK_LABEL[t]}: level ${lv[t]} of ${MAX_LEVEL}`}
          >
            {TRACK_LABEL[t]} {lv[t]}→{Math.min(MAX_LEVEL, lv[t] + 1)}{' '}
            {lv[t] < MAX_LEVEL && <CostLine cost={improveCost(ctx, actor, t)} />}
          </button>
        ))}
      </div>
    </>
  );
}

export function ProgressHand({
  state,
  actor,
  legal,
  act,
  names,
}: {
  state: GameState;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  names: string[];
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const held = TRACKS.flatMap((t) =>
    (state.players[actor]?.held[t] ?? []).map((h) => ({ card: h.card, deck: t })),
  );
  const played = state.players[actor]?.played ?? {};
  const vpCards = (played.printer ?? 0) + (played.constitution ?? 0);
  if (!held.length && !vpCards) return null;
  const options = (card: string) =>
    legal.filter((a) => a.type === 'playProgress' && a.card === card);
  return (
    <div className="dev-cards" aria-label="Progress cards">
      {held.map((h, i) => {
        const opts = options(h.card);
        return (
          <button
            key={i}
            type="button"
            className="dev"
            style={{ borderColor: TRACK_COLOR[h.deck] }}
            disabled={!opts.length}
            title={nameOf(h.card).name}
            onClick={() => {
              if (opts.length === 1) act(opts[0] as Action);
              else setPicking(h.card);
            }}
          >
            {nameOf(h.card).icon} {nameOf(h.card).name}
          </button>
        );
      })}
      {vpCards > 0 && <span className="dev">⭐ {vpCards} point card(s)</span>}
      {picking === 'alchemist' && (
        <AlchemistDialog
          onPick={(red, yellow) => {
            act({ type: 'playProgress', player: actor, card: 'alchemist', red, yellow });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {picking && picking !== 'alchemist' && (
        <Modal title={nameOf(picking).name} onClose={() => setPicking(null)}>
          <div className="row">
            {options(picking).map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  act(a);
                  setPicking(null);
                }}
              >
                {optionLabel(a, names)}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function AlchemistDialog({
  onPick,
  onClose,
}: {
  onPick: (red: number, yellow: number) => void;
  onClose: () => void;
}) {
  const [red, setRed] = useState(3);
  const [yellow, setYellow] = useState(4);
  const die = (label: string, v: number, set: (n: number) => void) => (
    <div>
      <p>{label}</p>
      <div className="row">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} type="button" className={v === n ? 'on' : ''} onClick={() => set(n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <Modal title="Alchemist: choose the dice" onClose={onClose}>
      {die('Red die', red, setRed)}
      {die('Yellow die', yellow, setYellow)}
      <p>Total {red + yellow}. The event die is still rolled.</p>
      <button type="button" className="primary" onClick={() => onPick(red, yellow)}>
        Roll with these
      </button>
    </Modal>
  );
}

/** Choices that are not spots on the board: decks, resources, cards, gifts. */
export function CkChoices({
  state,
  actor,
  legal,
  act,
  names,
}: {
  state: GameState;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
  names: string[];
}) {
  const ph = state.phase.id;
  const peek = (state.data['cities-knights']?.peek ?? null) as {
    seat: number;
    hand?: Record<string, number>;
    progress?: string[];
  } | null;
  const list = (types: string[], title: string, text?: string) => {
    const opts = legal.filter((a) => types.includes(a.type));
    if (!opts.length) return null;
    return (
      <Modal title={title}>
        {text && <p>{text}</p>}
        <div className="row">
          {opts.map((a, i) => (
            <button key={i} type="button" onClick={() => act(a)}>
              {optionLabel(a, names)}
            </button>
          ))}
        </div>
      </Modal>
    );
  };
  switch (ph) {
    case 'defenderPick':
      return list(
        ['pickDefenderCard'],
        'Defenders tie',
        'Draw one progress card from a deck of your choice.',
      );
    case 'treasureProgress':
      return list(
        ['treasureProgress'],
        'Treasure',
        'Your treasure is a progress card: take the top card of a deck of your choice.',
      );
    case 'aqueduct':
      return list(
        ['aqueductPick'],
        'Aqueduct',
        'You got nothing this roll. Take any one resource.',
      );
    case 'commercialHarbor':
      if (state.phase.pending !== undefined)
        return list(
          ['harborGive'],
          'Commercial Harbor',
          `${names[state.turn.player] ?? 'A player'} gave you a resource. Pick a commodity to give back.`,
        );
      return list(
        ['harborSwap', 'ckDone'],
        'Commercial Harbor',
        'Give a player one resource; they pick one of their commodities to give you.',
      );
    case 'progressDiscard':
      return list(
        ['returnProgress'],
        'Too many progress cards',
        'You may hold 4 progress cards (points cards do not count). Pick one to put back under its deck.',
      );
    case 'spy':
      return list(['takeProgress', 'ckDone'], 'Spy', 'Their progress cards. Take one, or none.');
    case 'masterMerchant':
      if (!peek?.hand || peek.seat !== actor) return null;
      return (
        <PickCards
          key={state.seq}
          title="Master Merchant"
          text="Their hand. Take the cards you want."
          need={state.phase.take as number}
          max={peek.hand}
          cards={handCards(state.modules)}
          onPick={(cards) => act({ type: 'takeCards', player: actor, cards })}
        />
      );
    case 'wedding': {
      const owed = (state.phase.owed as Record<number, number>)[actor];
      if (!owed) return null;
      return (
        <PickCards
          key={state.seq}
          title="Wedding gift"
          text={`Give ${names[state.phase.by as number]} ${owed} card(s) of your choice.`}
          need={owed}
          max={state.players[actor]?.hand ?? {}}
          cards={handCards(state.modules)}
          onPick={(cards) => act({ type: 'giveGift', player: actor, cards })}
        />
      );
    }
    default:
      return null;
  }
}

function PickCards({
  title,
  text,
  need,
  max,
  cards,
  onPick,
}: {
  title: string;
  text: string;
  need: number;
  max: Record<string, number>;
  cards: readonly string[];
  onPick: (c: Record<string, number>) => void;
}) {
  const [pick, setPick] = useState<Record<string, number>>({});
  return (
    <Modal title={title}>
      <p>{text}</p>
      <CardPicker value={pick} onChange={setPick} max={max} label={title} cards={cards} />
      <button
        type="button"
        className="primary"
        disabled={total(pick) !== need}
        onClick={() => onPick(clean(pick))}
      >
        Done {total(pick)}/{need}
      </button>
    </Modal>
  );
}

export function CommodityCards({ hand }: { hand: Record<string, number> }) {
  return (
    <>
      {(['paper', 'cloth', 'coin'] as const).map((c) => (
        <ResourceCard key={c} card={c} count={hand[c] ?? 0} dim={!hand[c]} />
      ))}
    </>
  );
}

export function trackCommodity(t: Track): string {
  return TRACK_COMMODITY[t];
}
