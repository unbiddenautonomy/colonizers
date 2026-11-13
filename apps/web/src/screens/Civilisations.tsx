import { useState } from 'react';
import type { Action, CornerId, Ctx, EdgeId, GameState, HexId } from '@colonizers/engine';
import {
  anyPicksOf,
  calendarTrack,
  CIV_BY_ID,
  CLASS_INFO,
  civOf,
  civView,
  giftsOf,
  habsburgDrawn,
  picksOf,
  routeKinds,
  START_NEUTRAL,
  swapsOf,
  type Civ,
  type Gift,
} from '@colonizers/module-civilisations';
import { nameOf } from '@colonizers/rulebook';
import type { Targets } from '../board/Board.tsx';
import { Modal } from '../ui/Modal.tsx';
import { hexLabel } from './WorldWonders.tsx';

/** Civilisations on screen: picking one, everyone's tiles, and the gifts and choices they bring. */

export const civsOn = (state: GameState) => state.modules.includes('civilisations');

export const CIV_MODES = [
  'civRoute',
  'civKnight',
  'civSettle',
  'civHarbor',
  'civGallic',
  'civRevolution',
  'civTiticaca',
  'civLeap',
] as const;

export type CivMode = (typeof CIV_MODES)[number];

/** Modes where you pick one thing on the board, then where it goes. */
const TWO_STEP: Partial<Record<CivMode, { first: string; then: string; kind: 'edge' | 'hex' }>> = {
  civHarbor: { first: 'from', then: 'to', kind: 'edge' },
  civTiticaca: { first: 'land', then: 'sea', kind: 'hex' },
};

/** Board targets for a civilisation's ability. `picked` is the first pick of a two-step one. */
export function civTargets(legal: Action[], mode: CivMode, picked: string | null): Targets {
  const t: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };
  const two = TWO_STEP[mode];
  for (const a of legal) {
    if (a.type !== mode) continue;
    if (two) {
      const first = a[two.first] as string;
      const where = picked === null ? first : (a[two.then] as string);
      if (picked !== null && first !== picked) continue;
      const target = picked === null ? { type: 'selectShip', player: a.player, ship: first } : a;
      if (two.kind === 'edge') t.edges.set(where as EdgeId, target);
      else t.hexes.set(where as HexId, target);
      continue;
    }
    if (typeof a.corner === 'string') t.corners.set(a.corner as CornerId, a);
    else if (typeof a.edge === 'string') t.edges.set(a.edge as EdgeId, a);
    else if (typeof a.hex === 'string') t.hexes.set(a.hex as HexId, a);
  }
  return t;
}

/** What to tap, for each mode. */
export function civModePrompt(who: string, mode: CivMode, picked: string | null): string {
  switch (mode) {
    case 'civRoute':
      return `${who}: tap where your free road or ship goes.`;
    case 'civKnight':
      return `${who}: tap a corner on your roads for your strong knight.`;
    case 'civSettle':
      return `${who}: tap where your free settlement goes.`;
    case 'civHarbor':
      return picked === null
        ? `${who}: tap the harbor to move.`
        : `${who}: tap where on the coast it goes. Onto another harbor swaps the two.`;
    case 'civGallic':
      return `${who}: tap the hex whose number swaps with the robber's.`;
    case 'civRevolution':
      return `${who}: tap a rival's strong knight.`;
    case 'civTiticaca':
      return picked === null
        ? `${who}: tap an inland hex to move.`
        : `${who}: tap the sea hex it swaps with.`;
    case 'civLeap':
      return `${who}: tap the city that goes back to a settlement.`;
  }
}

const icon = (card: string) => nameOf(card).icon ?? nameOf(card).name;

/** "2 free roads and a free road or ship", from the route gifts waiting. */
function routeText(kinds: ('road' | 'ship' | 'route')[]): string {
  const names = {
    road: ['road', 'roads'],
    ship: ['ship', 'ships'],
    route: ['road or ship', 'roads or ships'],
  };
  return (['road', 'ship', 'route'] as const)
    .map((k) => {
      const n = kinds.filter((x) => x === k).length;
      if (!n) return '';
      return n === 1 ? `A free ${names[k][0]}` : `${n} free ${names[k][1]}`;
    })
    .filter(Boolean)
    .join(', and ');
}

const DIE_NAMES: Record<string, string> = { red: 'red', yellow: 'yellow', event: 'event' };

/** "Throw red and event", or "Throw all three". */
const rerollLabel = (dice: string) => {
  const which = dice.split('+');
  if (which.length === 3) return 'Throw all three again';
  return `Throw ${which.map((d) => DIE_NAMES[d] ?? d).join(' and ')} again`;
};

const eventName = (face: string) =>
  face === 'ship' ? 'the barbarian ship' : face === 'wild' ? 'the wild gate' : `the ${face} gate`;

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const WHERE: Record<Extract<Gift, { kind: 'settlement' }>['where'], string> = {
  any: 'by your roads',
  inland: 'inland, by your roads',
  coastal: 'on the coast, by your roads or ships',
  island: 'on an island where you have no building',
};

/** One civilisation tile. */
function Tile({ civ, unlocked }: { civ: Civ; unlocked?: boolean }) {
  const cls = CLASS_INFO[civ.cls];
  return (
    <div className="civ-tile">
      <header className="row wrap">
        <strong>{civ.name}</strong>
        <span className="muted small">
          {cls.icon} {cls.name}
        </span>
      </header>
      <p className="small">
        <em>{civ.start.name}:</em> {civ.start.text}
      </p>
      <p className={`small${unlocked ? '' : ' muted'}`}>
        <em>From 10 points, {civ.later.name}:</em> {civ.later.text}
      </p>
      {civ.wonder && (
        <p className="small muted">
          Wonder: {nameOf(civ.wonder.id).name}, started with {civ.wonder.needs}, first stage free.
        </p>
      )}
      <p className="small muted">
        {cls.icon} {cls.bonus}
      </p>
    </div>
  );
}

/** Everyone's civilisation; on your turn, the gifts and abilities you can use. */
export function CivPanel({
  ctx,
  actor,
  legal,
  act,
  setMode,
}: {
  ctx: Ctx;
  actor: number | null;
  legal: Action[];
  act: (a: Action) => void;
  setMode?: (m: CivMode | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const d = civView(ctx);
  if (!d.revealed) return null;
  const gifts = actor === null ? [] : giftsOf(ctx, actor);
  const has = (type: string) => legal.some((a) => a.type === type);
  const improve = legal.filter((a) => a.type === 'civImprove');
  const calendar = legal.filter((a) => a.type === 'civCalendar');
  const silk = legal.filter((a) => a.type === 'civSilk');
  const habsburg = legal.filter((a) => a.type === 'civHabsburg');
  const track = actor === null ? null : calendarTrack(ctx, actor);
  const routes = actor === null ? [] : routeKinds(ctx, actor);
  const settles = gifts.filter(
    (g): g is Extract<Gift, { kind: 'settlement' }> => g.kind === 'settlement',
  );
  const MODES: [CivMode, string, string][] = [
    ['civHarbor', 'Move a harbor anywhere on the coast, or swap two', 'Pick the harbor'],
    ['civGallic', "Once a game, swap the robber hex's number with another", 'Pick the hex'],
    ['civRevolution', "Once a game, bring down a rival's strong knight", 'Pick the knight'],
    ['civTiticaca', 'Once a game, swap an inland hex with the sea', 'Pick the hex'],
    [
      'civLeap',
      'Once a game, a city back to a settlement for five progress cards',
      'Pick the city',
    ],
  ];
  const ready =
    has('civRoute') ||
    has('civKnight') ||
    has('civSettle') ||
    has('civKhagan') ||
    MODES.some(([m]) => has(m)) ||
    improve.length > 0 ||
    calendar.length > 0 ||
    silk.length > 0 ||
    habsburg.length > 0;
  const doAct = (a: Action) => {
    act(a);
    setOpen(false);
  };
  const pick = (m: CivMode) => {
    setMode?.(m);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className={ready ? 'ready' : ''}
        onClick={() => setOpen(true)}
        title="Civilisations: who leads which, and what they can do"
      >
        🏳️ Civilisations{ready ? ' ✨' : ''}
      </button>
      {open && (
        <Modal title="Civilisations" onClose={() => setOpen(false)} wide>
          {ready && (
            <div className="wonder-abilities">
              {has('civRoute') && (
                <p className="row wrap">
                  {routeText(routes)}:{' '}
                  <button type="button" onClick={() => pick('civRoute')}>
                    Place {routes.length > 1 ? 'one' : 'it'}
                  </button>
                </p>
              )}
              {has('civSettle') && (
                <p className="row wrap">
                  A free settlement {settles.map((g) => WHERE[g.where]).join(', or ')}:{' '}
                  <button type="button" onClick={() => pick('civSettle')}>
                    Place it
                  </button>
                </p>
              )}
              {MODES.filter(([m]) => has(m)).map(([m, text, button]) => (
                <p key={m} className="row wrap">
                  {text}:{' '}
                  <button type="button" onClick={() => pick(m)}>
                    {button}
                  </button>
                </p>
              ))}
              {has('civKhagan') && (
                <p className="row wrap">
                  You rolled a 3 or 11:{' '}
                  <button
                    type="button"
                    onClick={() => doAct({ type: 'civKhagan', player: actor as number })}
                  >
                    Move the robber
                  </button>
                </p>
              )}
              {silk.length > 0 && (
                <p className="row wrap">
                  Pick the resource you trade 2:1:{' '}
                  {silk.map((a) => (
                    <button key={a.card as string} type="button" onClick={() => doAct(a)}>
                      {icon(a.card as string)} {nameOf(a.card as string).name}
                    </button>
                  ))}
                </p>
              )}
              {habsburg.length > 0 && (
                <p className="row wrap">
                  Once a game, a card from each deck and two more from:{' '}
                  {habsburg.map((a) => (
                    <button key={a.deck as string} type="button" onClick={() => doAct(a)}>
                      {title(a.deck as string)}
                    </button>
                  ))}
                </p>
              )}
              {has('civKnight') && (
                <p className="row wrap">
                  A free active strong knight:{' '}
                  <button type="button" onClick={() => pick('civKnight')}>
                    Place it
                  </button>
                </p>
              )}
              {improve.length > 0 && (
                <p className="row wrap">
                  A free city improvement:{' '}
                  {improve.map((a) => (
                    <button key={a.track as string} type="button" onClick={() => doAct(a)}>
                      {a.track as string}
                    </button>
                  ))}
                </p>
              )}
              {calendar.length > 0 && track && (
                <p className="row wrap">
                  Once a game, turn back someone&apos;s {track} track while yours goes up:{' '}
                  {calendar.map((a) => (
                    <button key={a.target as number} type="button" onClick={() => doAct(a)}>
                      {ctx.state.players[a.target as number]?.name}
                    </button>
                  ))}
                </p>
              )}
            </div>
          )}
          <div className="wonder-list">
            {ctx.state.players.map((p) => {
              const c = civOf(ctx, p.seat);
              if (!c) return null;
              return (
                <section key={p.seat} className="wonder">
                  <p className="small">
                    <strong>{p.seat === actor ? 'You' : p.name}</strong>
                    {d.unlocked?.[p.seat] ? ' (reached 10 points)' : ''}
                  </p>
                  <Tile civ={c} unlocked={d.unlocked?.[p.seat] === true} />
                </section>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}

/** A player's civilisation, for the player list. */
export function CivStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const c = civOf(ctx, seat);
  if (!c) return null;
  const unlocked = civView(ctx).unlocked?.[seat];
  return (
    <span className="small" title={`${c.name} (${CLASS_INFO[c.cls].name})`}>
      {CLASS_INFO[c.cls].icon} {c.name}
      {unlocked ? ' ✨' : ''}
    </span>
  );
}

/** Picking a civilisation, and the cards civilisations hand out. */
export function CivChoices({
  state,
  ctx,
  actor,
  legal,
  act,
}: {
  state: GameState;
  ctx: Ctx;
  actor: number;
  legal: Action[];
  act: (a: Action) => void;
}) {
  const [skipped, setSkipped] = useState('');
  const picks = legal.filter((a) => a.type === 'pickCiv');
  if (state.phase.id === 'civPick' && picks.length) {
    return (
      <Modal title="Pick your civilisation" wide>
        <p className="small muted">Keep one. The others see it once everyone has picked.</p>
        <div className="wonder-list">
          {picks.map((a) => {
            const civ = CIV_BY_ID[a.civ as string]!;
            return (
              <section key={civ.id} className="wonder">
                <Tile civ={civ} />
                <button type="button" onClick={() => act(a)}>
                  Lead {civ.name}
                </button>
              </section>
            );
          })}
        </div>
      </Modal>
    );
  }
  if (state.phase.id === 'civDemocracy') {
    const opts = legal.filter((a) => a.type === 'civDemocracy');
    if (!opts.length) return null;
    const held = state.phase.held as { red: number; yellow: number; event: string };
    const roller = state.phase.roller as number;
    return (
      <Modal title="Athenian Democracy">
        <p>
          {roller === actor ? 'You' : (state.players[roller]?.name ?? 'A player')} rolled red{' '}
          {held.red} and yellow {held.yellow} ({held.red + held.yellow}), with{' '}
          {eventName(held.event)}. Throw some dice again? The new throw is final, and you can do
          this once every two rounds.
        </p>
        <div className="row wrap">
          {opts.map((a) => (
            <button key={a.dice as string} type="button" onClick={() => act(a)}>
              {a.dice === 'keep' ? 'Keep these dice' : rerollLabel(a.dice as string)}
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  if (state.phase.id === 'civMuscovy' && legal.some((a) => a.type === 'civMuscovy')) {
    return (
      <Modal title="Treatises of Muscovy">
        <p>
          {state.players[state.turn.player]?.name} rolled a 7. Throw the dice and put the robber on
          a hex with that number for them? A 7 lets you pick any hex.
        </p>
        <div className="row wrap">
          <button
            type="button"
            onClick={() => act({ type: 'civMuscovy', player: actor, use: true })}
          >
            Throw the dice
          </button>
          <button
            type="button"
            onClick={() => act({ type: 'civMuscovy', player: actor, use: false })}
          >
            Let them place it
          </button>
        </div>
      </Modal>
    );
  }
  if (state.phase.id === 'civHabsburg' && legal.some((a) => a.type === 'civHabsburgKeep'))
    return <HabsburgKeep state={state} ctx={ctx} actor={actor} act={act} />;
  const progress = legal.filter((a) => a.type === 'civProgress');
  if (progress.length) {
    return (
      <Modal title="A progress card of your choice">
        <p>Pick the deck to draw from:</p>
        <div className="row wrap">
          {progress.map((a) => (
            <button key={a.deck as string} type="button" onClick={() => act(a)}>
              {title(a.deck as string)}
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  const harvest = legal.filter((a) => a.type === 'civHarvest');
  if (harvest.length) {
    return (
      <Modal title="A card from beside your building">
        <p>Take a card from a hex beside it:</p>
        <div className="row wrap">
          {harvest.map((a) => (
            <button key={a.hex as string} type="button" onClick={() => act(a)}>
              {hexLabel(state, a.hex as HexId)}
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  const n = picksOf(ctx, actor);
  const choose = legal.filter((a) => a.type === 'civPick');
  if (n && choose.length) {
    return (
      <Modal title="A gift from your civilisation">
        <p>Take {n === 1 ? 'a resource' : `${n} resources`} of your choice.</p>
        <div className="row wrap">
          {choose.map((a) => (
            <button key={a.card as string} type="button" onClick={() => act(a)}>
              {icon(a.card as string)} {nameOf(a.card as string).name}
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  const any = anyPicksOf(ctx, actor);
  const chooseAny = legal.filter((a) => a.type === 'civPickAny');
  if (any && chooseAny.length) {
    return (
      <Modal title="A gift from your civilisation">
        <p>Take any resource or commodity.</p>
        <div className="row wrap">
          {chooseAny.map((a) => (
            <button key={a.card as string} type="button" onClick={() => act(a)}>
              {icon(a.card as string)} {nameOf(a.card as string).name}
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  const swaps = legal.filter((a) => a.type === 'civSwap');
  const key = `${state.turn.number}:${swapsOf(ctx, actor).join(',')}`;
  if (swaps.length && skipped !== key) {
    const gives = [...new Set(swaps.map((a) => a.give as string))];
    return (
      <Modal title="Any card you like" onClose={() => setSkipped(key)}>
        {gives.map((give) => (
          <p key={give} className="row wrap">
            Swap a {nameOf(give).name} for:{' '}
            {swaps
              .filter((a) => a.give === give)
              .map((a) => (
                <button key={a.get as string} type="button" onClick={() => act(a)}>
                  {icon(a.get as string)}
                </button>
              ))}
          </p>
        ))}
        <button type="button" onClick={() => setSkipped(key)}>
          Keep my cards
        </button>
      </Modal>
    );
  }
  return null;
}

/** Austria's Habsburg Marriage: keep three of the cards drawn. */
function HabsburgKeep({
  state,
  ctx,
  actor,
  act,
}: {
  state: GameState;
  ctx: Ctx;
  actor: number;
  act: (a: Action) => void;
}) {
  const [keep, setKeep] = useState<number[]>([]);
  const drawn = habsburgDrawn(ctx);
  const toggle = (i: number) =>
    setKeep((k) => (k.includes(i) ? k.filter((x) => x !== i) : k.length < 3 ? [...k, i] : k));
  return (
    <Modal title="Habsburg Marriage">
      <p>Keep three; the rest go back under their decks.</p>
      <div className="row wrap">
        {drawn.map((d, i) => (
          <button
            key={`${state.turn.number}:${i}`}
            type="button"
            className={keep.includes(i) ? 'ready' : ''}
            aria-pressed={keep.includes(i)}
            onClick={() => toggle(i)}
          >
            {nameOf(d.card).name} ({title(d.deck)})
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={keep.length !== 3}
        onClick={() => act({ type: 'civHabsburgKeep', player: actor, keep })}
      >
        Keep these three
      </button>
    </Modal>
  );
}

export function civPrompt(state: GameState, names: string[], actor: number | null): string | null {
  if (state.phase.id === 'civPick') {
    const owed = (state.phase.owed ?? {}) as Record<number, number>;
    return actor !== null && owed[actor]
      ? 'Pick the civilisation you will lead.'
      : 'Waiting for everyone to pick a civilisation.';
  }
  const owedTo = () =>
    Object.keys((state.phase.owed ?? {}) as Record<number, number>).map(Number)[0] ?? null;
  if (state.phase.id === 'civDemocracy') {
    const g = owedTo();
    return g === actor
      ? 'Keep the dice, or throw some again.'
      : `Waiting for ${g === null ? 'Greece' : names[g]} to keep the dice or throw again.`;
  }
  if (state.phase.id === 'civMuscovy') {
    const r = owedTo();
    return r === actor
      ? 'Throw the dice for the robber, or let them place it.'
      : `Waiting for ${r === null ? 'Russia' : names[r]} to throw for the robber.`;
  }
  if (state.phase.id === 'civMuscovyHex') {
    const r = owedTo();
    const total = state.phase.total as number;
    return r === actor
      ? `You threw ${total}: tap the hex where the robber goes.`
      : `${r === null ? 'Russia' : names[r]} threw ${total} and puts the robber on a hex.`;
  }
  if (state.phase.id === 'civHabsburg') {
    const a = owedTo();
    return a === actor
      ? 'Keep three of the cards you drew.'
      : `Waiting for ${a === null ? 'Austria-Hungary' : names[a]} to keep three cards.`;
  }
  if (state.phase.id === 'civNeutral') {
    const owed = Object.keys((state.phase.owed ?? {}) as Record<number, number>).map(Number);
    const civs = (state.data.civilisations as { civ?: Record<number, string> } | undefined)?.civ;
    return owed
      .map((s) => {
        const piece = START_NEUTRAL[civs?.[s] ?? ''] ?? 'piece';
        return `${names[s] ?? 'A player'}: put the ${nameOf(piece).name} on any land hex.`;
      })
      .join(' ');
  }
  return null;
}
