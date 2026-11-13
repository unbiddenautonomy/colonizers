import { useState } from 'react';
import type { Action, Ctx, GameState, HexId } from '@colonizers/engine';
import {
  calendarTrack,
  CIV_BY_ID,
  CLASS_INFO,
  civOf,
  civView,
  giftsOf,
  picksOf,
  START_NEUTRAL,
  swapsOf,
  type Civ,
} from '@colonizers/module-civilisations';
import { nameOf } from '@colonizers/rulebook';
import { Modal } from '../ui/Modal.tsx';
import { hexLabel } from './WorldWonders.tsx';

/** Civilisations on screen: picking one, everyone's tiles, and the gifts and choices they bring. */

export const civsOn = (state: GameState) => state.modules.includes('civilisations');

export type CivMode = 'civRoute' | 'civKnight';

const icon = (card: string) => nameOf(card).icon ?? nameOf(card).name;

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
  const track = actor === null ? null : calendarTrack(ctx, actor);
  const ready = has('civRoute') || has('civKnight') || improve.length > 0 || calendar.length > 0;
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
                  {gifts.filter((g) => g.kind === 'route').length} free road or ship:{' '}
                  <button type="button" onClick={() => pick('civRoute')}>
                    Place it
                  </button>
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
  const harvest = legal.filter((a) => a.type === 'civHarvest');
  if (harvest.length) {
    return (
      <Modal title="Your new building">
        <p>Your Republic takes a card from a hex beside it:</p>
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

export function civPrompt(state: GameState, names: string[], actor: number | null): string | null {
  if (state.phase.id === 'civPick') {
    const owed = (state.phase.owed ?? {}) as Record<number, number>;
    return actor !== null && owed[actor]
      ? 'Pick the civilisation you will lead.'
      : 'Waiting for everyone to pick a civilisation.';
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
