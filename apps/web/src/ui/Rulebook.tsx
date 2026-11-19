import { useState } from 'react';
import { Ctx, type GameState } from '@colonizers/engine';
import {
  cardGroups,
  fillSettings,
  rulebookFor,
  RULEBOOKS,
  searchPages,
  type RulePage,
} from '@colonizers/rulebook';
import { library } from '../game/library.ts';
import { CostLine } from './Cards.tsx';
import { Modal } from './Modal.tsx';

type Tab = 'game' | 'costs' | 'cards' | 'all';

/** What each deck is called in the game, for the glossary's headings. */
const DECK_NAME: Record<string, string> = {
  dev: 'development cards',
  science: 'science (green)',
  trade: 'trade (yellow)',
  politics: 'politics (blue)',
  magic: 'magic (purple)',
  religion: 'religion (red)',
  wealth: 'wealth (gold)',
};

/** Renders the rulebook's tiny markup: paragraphs, bullets, numbered lines and **bold**. */
function RuleText({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);
  const inline = (s: string) =>
    s
      .split(/(\*\*[^*]+\*\*)/)
      .map((part, i) =>
        part.startsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      );
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            <ol key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\d+\. /, ''))}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{inline(b)}</p>;
      })}
    </>
  );
}

export function Rulebook({
  state,
  viewer,
  initialPage,
  onClose,
}: {
  state: GameState | null;
  viewer: number | null;
  initialPage?: string | null;
  onClose: () => void;
}) {
  // "This game" and the cost card need a game; from the home page the rulebook
  // opens on the full book instead of showing a tab that cannot say anything.
  const [tab, setTab] = useState<Tab>(initialPage || !state ? 'all' : 'game');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(initialPage ?? null);
  const settings: Record<string, unknown> = state
    ? { ...library.registry(state.modules).settings, ...state.settings }
    : {
        vpTarget: 10,
        discardLimit: 7,
        longestRoadMin: 5,
        largestArmyMin: 3,
        islandBonus: 2,
        barbarianTrack: 7,
      };
  const books = state ? rulebookFor(state.modules) : RULEBOOKS;
  const pages = (tab === 'all' ? RULEBOOKS : books).flatMap((b) => b.pages);
  const shown = searchPages(pages, query);

  const costRows = (() => {
    if (!state) return [];
    const reg = library.registry(state.modules);
    const ctx = new Ctx(state, reg);
    const items = Object.assign({}, ...books.map((b) => b.items ?? {})) as Record<
      string,
      { name: string; note: string }
    >;
    const ck = state.modules.includes('cities-knights');
    return Object.keys(reg.costs)
      .filter((item) => !(ck && item === 'devCard'))
      .map((item) => {
        const cost = viewer === null ? reg.costs[item]! : ctx.cost(item, viewer);
        return {
          item,
          name: items[item]?.name ?? item,
          note: items[item]?.note ?? '',
          cost,
          affordable: viewer !== null && ctx.has(viewer, cost),
        };
      });
  })();

  const page = (p: RulePage) => (
    <article key={p.id} className={`rule-page${open === p.id ? ' open' : ''}`}>
      <button
        type="button"
        className="rule-title"
        onClick={() => setOpen(open === p.id ? null : p.id)}
        aria-expanded={open === p.id}
      >
        <strong>{p.title}</strong>
        <span className="muted">{fillSettings(p.summary, settings)}</span>
      </button>
      {open === p.id && (
        <div className="rule-body">
          <RuleText text={fillSettings(p.body, settings)} />
        </div>
      )}
    </article>
  );

  return (
    <Modal title="Rulebook" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {(
          [
            ...(state
              ? ([
                  ['game', 'This game'],
                  ['costs', 'Cost card'],
                ] as [Tab, string][])
              : []),
            ['cards', 'Cards'],
            ['all', 'Full rulebook'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tab on' : 'tab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === 'game' || tab === 'all') && (
        <>
          <input
            className="search"
            type="search"
            placeholder="Search rules…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search rules"
          />
          {tab === 'game' && state && (
            <p className="muted">
              First to <strong>{String(settings.vpTarget)}</strong> points. Discard when holding
              more than <strong>{String(settings.discardLimit)}</strong> cards on a 7.
            </p>
          )}
          <div className="rule-list">
            {shown.length ? shown.map(page) : <p className="muted">No rules match.</p>}
          </div>
        </>
      )}

      {tab === 'costs' && (
        <table className="cost-card">
          <tbody>
            {costRows.map((r) => (
              <tr key={r.item} className={r.affordable ? '' : 'dim'}>
                <th scope="row">{r.name}</th>
                <td>
                  <CostLine cost={r.cost} />
                </td>
                <td className="muted">{r.note}</td>
              </tr>
            ))}
            {!costRows.length && (
              <tr>
                <td>Start a game to see costs.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {tab === 'cards' &&
        cardGroups(books).map((g) => (
          <section key={`${g.module}/${g.deck}`} className="card-group">
            <h3>
              {g.name} <span className="muted">{DECK_NAME[g.deck] ?? g.deck}</span>
            </h3>
            <dl className="glossary">
              {g.cards.map((c) => (
                <div key={c.id}>
                  <dt>{c.name}</dt>
                  <dd>
                    {c.text}
                    {c.alsoIn && <span className="muted"> Also in {c.alsoIn.join(' and ')}.</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
    </Modal>
  );
}
