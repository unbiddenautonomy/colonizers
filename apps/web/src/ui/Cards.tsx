import { RESOURCE_ICON } from '../theme/clean.ts';
import { cardColor, useTheme } from '../theme/themes.tsx';
import { nameOf } from '@colonizers/rulebook';

export const RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore'] as const;
export const COMMODITY_CARDS = ['paper', 'cloth', 'coin'] as const;
/** Greed, Wealth & Power's commodities. */
export const GWP_CARDS = ['crystal', 'bread', 'gold'] as const;
/** Witches, Wizards & Dragons' Crystal, and Church, Faith & Reformation's Bread and Beer. */
export const WITCHES_CARDS = ['crystal'] as const;
export const CHURCH_CARDS = ['bread', 'beer'] as const;

/** Commodities the fan expansions add to Cities & Knights, for the hand row. */
export function fanCommodities(modules: readonly string[]): string[] {
  if (modules.includes('greed-wealth-power')) return [...GWP_CARDS];
  return [
    ...(modules.includes('witches') ? WITCHES_CARDS : []),
    ...(modules.includes('church') ? CHURCH_CARDS : []),
  ];
}

/** Card types players trade and hold in this game. */
export function handCards(modules: readonly string[]): readonly string[] {
  if (!modules.includes('cities-knights')) return RESOURCES;
  return [...RESOURCES, ...COMMODITY_CARDS, ...fanCommodities(modules)];
}

export function ResourceCard({
  card,
  count,
  dim,
}: {
  card: string;
  count?: number | undefined;
  dim?: boolean;
}) {
  const theme = useTheme();
  return (
    <span
      className={`rcard${dim ? ' dim' : ''}`}
      style={{ background: cardColor(theme, card) }}
      title={nameOf(card).name}
    >
      <span className="rcard-icon" aria-hidden="true">
        {RESOURCE_ICON[card] ?? '?'}
      </span>
      {count !== undefined && <span className="rcard-count">{count}</span>}
      <span className="sr-only">
        {count} {nameOf(card).name}
      </span>
    </span>
  );
}

export function CostLine({ cost }: { cost: Record<string, number> }) {
  const theme = useTheme();
  return (
    <span className="cost">
      {Object.entries(cost).flatMap(([c, n]) =>
        Array.from({ length: n }, (_, i) => (
          <span
            key={`${c}${i}`}
            className="cost-dot"
            style={{ background: cardColor(theme, c) }}
            title={nameOf(c).name}
          >
            {RESOURCE_ICON[c]}
          </span>
        )),
      )}
    </span>
  );
}

/** Pick counts of each resource with +/- buttons. */
export function CardPicker({
  value,
  onChange,
  max,
  label,
  cards = RESOURCES,
}: {
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  max?: Record<string, number>;
  label: string;
  cards?: readonly string[];
}) {
  return (
    <div className="picker" role="group" aria-label={label}>
      {cards.map((r) => {
        const n = value[r] ?? 0;
        const limit = max ? (max[r] ?? 0) : 99;
        return (
          <div key={r} className="picker-row">
            <ResourceCard card={r} count={max ? limit : undefined} dim={limit === 0} />
            <button
              type="button"
              className="small"
              disabled={n <= 0}
              onClick={() => onChange({ ...value, [r]: n - 1 })}
              aria-label={`Less ${r}`}
            >
              −
            </button>
            <span className="picker-n">{n}</span>
            <button
              type="button"
              className="small"
              disabled={n >= limit}
              onClick={() => onChange({ ...value, [r]: n + 1 })}
              aria-label={`More ${r}`}
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function total(c: Record<string, number>): number {
  return Object.values(c).reduce((s, n) => s + n, 0);
}

export function clean(c: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(c).filter(([, n]) => n > 0));
}
