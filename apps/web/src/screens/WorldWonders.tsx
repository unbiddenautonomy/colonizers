import { useState } from 'react';
import type { Action, Ctx, GameState, HexId } from '@colonizers/engine';
import {
  builtWonders,
  picksOf,
  stageItem,
  WONDER_IDS,
  WONDERS,
  type WonderId,
} from '@colonizers/module-world-wonders';
import { nameOf } from '@colonizers/rulebook';
import { CostLine } from '../ui/Cards.tsx';
import { Modal } from '../ui/Modal.tsx';

/** World Wonders on screen: the wonders list with its build buttons, and the wonders' abilities. */

export const wondersOn = (state: GameState) => state.modules.includes('world-wonders');

const ROMAN = ['I', 'II', 'III', 'IV'];
const RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore'];

const icon = (card: string) => nameOf(card).icon ?? nameOf(card).name;

/** "Forest 6", for picking a wonder's hex. */
export function hexLabel(state: GameState, hex: HexId): string {
  const h = state.hexes[hex];
  if (!h) return hex;
  const name = h.type.charAt(0).toUpperCase() + h.type.slice(1);
  return h.token ? `${name} ${h.token}` : name;
}

function WonderRow({
  ctx,
  id,
  actor,
  legal,
  act,
}: {
  ctx: Ctx;
  id: WonderId;
  actor: number | null;
  legal: Action[];
  act: (a: Action) => void;
}) {
  const w = WONDERS[id];
  const built = builtWonders(ctx)[id];
  const stages = built?.stages ?? 0;
  const owner = built ? ctx.state.players[built.owner]?.name : null;
  const mine = legal.filter((a) => a.type === 'buildWonder' && a.wonder === id);
  const labels = new Map<string, number>();
  return (
    <section className={`wonder${built ? ' owned' : ''}`}>
      <header className="row wrap">
        <strong>
          {w.icon} {w.name}
        </strong>
        <span className="muted small">
          {built
            ? `${built.owner === actor ? 'Yours' : `${owner}'s`}, ${stages === 4 ? 'finished' : `${stages} of 4 stages`}`
            : `Needs ${w.needs}`}
        </span>
      </header>
      <ul className="wonder-stages">
        {w.stages.map((s, i) => (
          <li key={s.name} className={i < stages ? 'done' : ''}>
            <span className="stage-no">{ROMAN[i]}</span> <em>{s.name}</em>{' '}
            <CostLine cost={actor === null ? s.cost : ctx.cost(stageItem(id, i + 1), actor)} />
            <br />
            <span className="small">
              {s.text}
              {!s.works && <span className="muted"> (coming in a later update)</span>}
            </span>
          </li>
        ))}
      </ul>
      {mine.length > 0 && (
        <div className="row wrap">
          {mine.map((a) => {
            const hex = a.hex as HexId | undefined;
            let text = `Build stage ${ROMAN[stages]}`;
            if (hex) {
              const base = hexLabel(ctx.state, hex);
              const n = (labels.get(base) ?? 0) + 1;
              labels.set(base, n);
              text = `Start on ${base}${n > 1 ? ` (${n})` : ''}`;
            }
            return (
              <button key={hex ?? 'next'} type="button" onClick={() => act(a)}>
                {text}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** The wonders, for everyone to look at; on your turn, with build and ability buttons. */
export function WonderPanel({
  ctx,
  actor,
  legal,
  act,
}: {
  ctx: Ctx;
  actor: number | null;
  legal: Action[];
  act: (a: Action) => void;
}) {
  const [open, setOpen] = useState(false);
  const [give, setGive] = useState('brick');
  const built = builtWonders(ctx);
  const ready = legal.some((a) => a.type === 'buildWonder');
  const gardens = legal.filter((a) => a.type === 'wonderTrade' && a.wonder === 'hangingGardens');
  const petra = legal.filter(
    (a) => a.type === 'wonderTrade' && a.wonder === 'petra' && a.give === give,
  );
  const petraGives = RESOURCES.filter((r) =>
    legal.some((a) => a.type === 'wonderTrade' && a.wonder === 'petra' && a.give === r),
  );
  const harvest = legal.filter((a) => a.type === 'wonderHarvest');
  const doAct = (a: Action) => {
    act(a);
    setOpen(false);
  };
  // Owned wonders first, then the ones still free.
  const order = [...WONDER_IDS].sort((a, b) => Number(!!built[b]) - Number(!!built[a]));
  return (
    <>
      <button
        type="button"
        className={ready ? 'ready' : ''}
        onClick={() => setOpen(true)}
        title="The World Wonders: who is building what, and what they need"
      >
        🏛️ Wonders{ready ? ' ✨' : ''}
      </button>
      {legal
        .filter((a) => a.type === 'wonderSiege' || a.type === 'wonderSweep')
        .map((a) => (
          <button key={a.type} type="button" onClick={() => act(a)}>
            {a.type === 'wonderSiege'
              ? '🏛️ Mausoleum: move the robber'
              : '🏹 Artemis: sweep the merchant off'}
          </button>
        ))}
      {open && (
        <Modal title="World Wonders" onClose={() => setOpen(false)} wide>
          {(gardens.length > 0 || petraGives.length > 0 || harvest.length > 0) && (
            <div className="wonder-abilities">
              {gardens.length > 0 && (
                <p className="row wrap">
                  🌿 Swap a lumber for:{' '}
                  {gardens.map((a) => (
                    <button key={a.get as string} type="button" onClick={() => doAct(a)}>
                      {icon(a.get as string)}
                    </button>
                  ))}
                </p>
              )}
              {petraGives.length > 0 && (
                <p className="row wrap">
                  🏜️ Silk Road: swap all your{' '}
                  <select value={give} onChange={(e) => setGive(e.target.value)}>
                    {RESOURCES.map((r) => (
                      <option key={r} value={r} disabled={!petraGives.includes(r)}>
                        {nameOf(r).name}
                      </option>
                    ))}
                  </select>{' '}
                  for:{' '}
                  {petra.map((a) => (
                    <button key={a.get as string} type="button" onClick={() => doAct(a)}>
                      {a.count as number} {icon(a.get as string)}
                    </button>
                  ))}
                </p>
              )}
              {harvest.length > 0 && (
                <p className="row wrap">
                  🛕 Pay 2 wool and this hex produces:{' '}
                  {harvest.map((a) => (
                    <button key={a.hex as string} type="button" onClick={() => doAct(a)}>
                      {hexLabel(ctx.state, a.hex as HexId)}
                    </button>
                  ))}
                </p>
              )}
            </div>
          )}
          <p className="muted small">
            One stage a turn. A finished wonder is worth 3 points
            {ctx.setting<boolean>('wonderToWin') !== false
              ? ', and you need one to win.'
              : '.'}{' '}
            Nobody can build on while the robber stands on a wonder.
          </p>
          <div className="wonder-list">
            {order.map((id) => (
              <WonderRow key={id} ctx={ctx} id={id} actor={actor} legal={legal} act={doAct} />
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Wonder points and finished wonders, for the player list. */
export function WonderStats({ ctx, seat }: { ctx: Ctx; seat: number }) {
  const mine = Object.entries(builtWonders(ctx)).filter(([, w]) => w?.owner === seat);
  if (!mine.length) return null;
  return (
    <span className="small" title="World Wonders">
      {mine.map(([id, w]) => (
        <span key={id} title={`${WONDERS[id as WonderId].name}: ${w!.stages} of 4 stages`}>
          {WONDERS[id as WonderId].icon}
          {ROMAN[w!.stages - 1]}{' '}
        </span>
      ))}
    </span>
  );
}

const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const REROLL_TEXT: Record<string, string> = {
  titus: '🏟️ Throw both again (Colosseum, once a turn)',
  'machu:a': '⛰️ Throw the first again',
  'machu:b': '⛰️ Throw the second again',
  'machu:both': '⛰️ Throw both again',
};

/** The held roll and any resources a wonder owes you. */
export function WonderChoices({
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
  if (state.phase.id === 'wonderRoll' && state.phase.roller === actor) {
    const held = state.phase.held as { a: number; b: number };
    const ck = state.modules.includes('cities-knights');
    const names = ck ? ['red', 'yellow'] : ['first', 'second'];
    return (
      <Modal title="Your roll">
        <p>
          You rolled {DIE[held.a]} {DIE[held.b]} ({held.a + held.b}). Throw again, or keep it. A
          second throw is final.
        </p>
        <div className="row wrap">
          <button type="button" onClick={() => act({ type: 'keepRoll', player: actor })}>
            Keep {held.a + held.b}
          </button>
          {legal
            .filter((a) => a.type === 'wonderReroll')
            .map((a) => (
              <button key={a.use as string} type="button" onClick={() => act(a)}>
                {(REROLL_TEXT[a.use as string] ?? (a.use as string))
                  .replace('the first', `the ${names[0]}`)
                  .replace('the second', `the ${names[1]}`)}
              </button>
            ))}
        </div>
      </Modal>
    );
  }
  const picks = picksOf(ctx, actor);
  const options = legal.filter((a) => a.type === 'wonderPick');
  if (!picks || !options.length) return null;
  return (
    <Modal title="A gift from your wonder">
      <p>
        Take {picks === 1 ? 'a resource' : `${picks} resources`} of your choice
        {picks > 1 ? ', one at a time' : ''}.
      </p>
      <div className="row wrap">
        {options.map((a) => (
          <button key={a.card as string} type="button" onClick={() => act(a)}>
            {icon(a.card as string)} {nameOf(a.card as string).name}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function wonderPrompt(state: GameState, names: string[]): string | null {
  if (state.phase.id !== 'wonderRoll') return null;
  return `${names[state.phase.roller as number] ?? 'A player'} may throw the dice again.`;
}
