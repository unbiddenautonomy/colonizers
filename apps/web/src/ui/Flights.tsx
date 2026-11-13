import { useEffect, useRef } from 'react';
import type { CornerId, Ctx, GameEvent, HexId } from '@colonizers/engine';
import { hexToPixel } from '@colonizers/engine';
import { RESOURCE_ICON, type Theme } from '../theme/clean.ts';
import { cardColor } from '../theme/themes.tsx';
import type { LogEntry } from '../game/useLocalGame.ts';
import { motionScale } from './motion.tsx';

/**
 * Cards that fly across the screen when they change hands: production from
 * the hexes that paid to each player, steals, trades, discards to the bank,
 * Monopoly, awards sliding to their new owner, and a short "your turn" cue.
 * Purely for show: it reads the game log and never touches the game.
 *
 * Targets are found by `data-seat` on each player's row, `.hand` for your
 * own hand, and the board `svg.board` for hexes and the bank.
 */

type Cards = Record<string, number>;
type Point = { x: number; y: number };

/** The board's hex size, as in Board.tsx. */
const S = 60;
/** Commodities come from the same hexes as these resources. */
const COMMODITY_FROM: Record<string, string> = {
  paper: 'forest',
  cloth: 'pasture',
  coin: 'mountains',
};
const MAX_FLIGHTS = 28;

function centre(el: Element | null): Point | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function board(): SVGSVGElement | null {
  return document.querySelector<SVGSVGElement>('.game svg.board');
}

function bankPoint(): Point | null {
  return centre(board());
}

function hexPoint(ctx: Ctx, id: HexId): Point | null {
  const svg = board();
  const h = ctx.state.hexes[id];
  const m = svg?.getScreenCTM();
  if (!svg || !h || !m) return null;
  const c = hexToPixel(h.q, h.r, S);
  const p = new DOMPoint(c.x, c.y).matrixTransform(m);
  return { x: p.x, y: p.y };
}

/** Hexes next to a player's buildings that give this card (on this number, if given). */
function sourceHexes(ctx: Ctx, seat: number, card: string, total?: number): HexId[] {
  const robber = Object.values(ctx.state.pieces).find((p) => p.type === 'robber')?.at;
  const robbed = robber?.kind === 'hex' ? robber.id : null;
  const out = new Set<HexId>();
  for (const p of Object.values(ctx.state.pieces)) {
    if (p.owner !== seat || p.at.kind !== 'corner' || p.type.startsWith('knight')) continue;
    for (const id of ctx.geometry.cornerHexes.get(p.at.id as CornerId) ?? []) {
      const h = ctx.state.hexes[id];
      if (!h || id === robbed) continue;
      if (total !== undefined && h.token !== total) continue;
      const gives = ctx.registry.hexTypes[h.type]?.produces;
      if (gives === card || COMMODITY_FROM[card] === h.type) out.add(id);
    }
  }
  return [...out];
}

interface Flight {
  from: Point;
  to: Point;
  /** Shown face up: a card type, or a label like "🏆". */
  face: string | null;
  label?: string;
}

export function CardFlights({
  log,
  ctx,
  viewer,
  theme,
  turnCue,
}: {
  log: LogEntry[];
  ctx: Ctx;
  /** Whose hand is on screen, if anyone's. */
  viewer: number | null;
  theme: Theme;
  /** What to say when this seat's turn starts, or null to say nothing. */
  turnCue: (seat: number) => string | null;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const seen = useRef(log.length);
  // The latest values for the effect below, without re-running it on each change.
  const latest = useRef({ ctx, viewer, theme, turnCue });
  useEffect(() => {
    latest.current = { ctx, viewer, theme, turnCue };
  });

  useEffect(() => {
    const fresh = log.slice(Math.min(seen.current, log.length));
    seen.current = log.length;
    const root = layer.current;
    const k = motionScale();
    if (!root || k === 0 || !fresh.length || fresh.length > 30) return;
    const { ctx, viewer, theme, turnCue } = latest.current;

    const seatPoint = (seat: number): Point | null =>
      (seat === viewer ? centre(document.querySelector('.game .hand')) : null) ??
      centre(document.querySelector(`[data-seat="${seat}"]`));

    const flights: Flight[] = [];
    const add = (from: Point | null, to: Point | null, face: string | null, label?: string) => {
      if (from && to && flights.length < MAX_FLIGHTS)
        flights.push(label === undefined ? { from, to, face } : { from, to, face, label });
    };
    const each = (cards: Cards | undefined, fn: (card: string) => void) => {
      for (const [card, n] of Object.entries(cards ?? {}))
        for (let i = 0; i < Math.min(n, 6); i++) fn(card);
    };
    let cue: string | null = null;

    const handle = (e: GameEvent) => {
      switch (e.type) {
        case 'production': {
          const received = (e.received ?? {}) as Record<string, Cards>;
          for (const [seatKey, cards] of Object.entries(received)) {
            const seat = Number(seatKey);
            const to = seatPoint(seat);
            for (const [card, n] of Object.entries(cards)) {
              const hexes = sourceHexes(ctx, seat, card, e.total as number);
              for (let i = 0; i < Math.min(n, 6); i++) {
                const hex = hexes[i % Math.max(1, hexes.length)];
                add(hex ? hexPoint(ctx, hex) : bankPoint(), to, card);
              }
            }
          }
          break;
        }
        case 'startingResources': {
          const seat = e.player as number;
          each(e.cards as Cards, (card) => {
            const hex = sourceHexes(ctx, seat, card)[0];
            add(hex ? hexPoint(ctx, hex) : bankPoint(), seatPoint(seat), card);
          });
          break;
        }
        case 'yearOfPlenty':
        case 'goldPicked':
        case 'eventGain':
        case 'progressGain':
        case 'discovered':
          each(e.cards as Cards, (card) => add(bankPoint(), seatPoint(e.player as number), card));
          break;
        case 'discarded':
          each(e.cards as Cards, (card) => add(seatPoint(e.player as number), bankPoint(), card));
          break;
        case 'bankTrade':
          each(e.gave as Cards, (card) => add(seatPoint(e.player as number), bankPoint(), card));
          each(e.got as Cards, (card) => add(bankPoint(), seatPoint(e.player as number), card));
          break;
        case 'stole':
          add(
            seatPoint(e.victim as number),
            seatPoint(e.thief as number),
            typeof e.card === 'string' ? e.card : null,
          );
          break;
        case 'traded':
          each(e.gave as Cards, (card) =>
            add(seatPoint(e.from as number), seatPoint(e.to as number), card),
          );
          each(e.got as Cards, (card) =>
            add(seatPoint(e.to as number), seatPoint(e.from as number), card),
          );
          break;
        case 'gifted':
          each(e.cards as Cards, (card) =>
            add(seatPoint(e.from as number), seatPoint(e.to as number), card),
          );
          break;
        case 'monopoly': {
          const others = ctx.state.players
            .map((p) => p.seat)
            .filter((s) => s !== (e.player as number));
          const taken = Math.min((e.taken as number) ?? 0, 8);
          for (let i = 0; i < taken && others.length; i++)
            add(
              seatPoint(others[i % others.length]!),
              seatPoint(e.player as number),
              e.resource as string,
            );
          break;
        }
        case 'award': {
          const from = typeof e.from === 'number' ? seatPoint(e.from) : bankPoint();
          add(from, seatPoint(e.to as number), null, '🏆');
          break;
        }
        case 'turnStarted':
          if (typeof e.player === 'number') cue = turnCue(e.player);
          break;
      }
    };
    for (const { event } of fresh) handle(event);

    flights.forEach((f, i) => {
      const el = document.createElement('div');
      el.className = f.label ? 'flight-card flight-label' : 'flight-card';
      if (f.label) el.textContent = f.label;
      else if (f.face) {
        el.style.background = cardColor(theme, f.face);
        el.textContent = RESOURCE_ICON[f.face] ?? '';
      } else el.classList.add('back');
      root.appendChild(el);
      const dx = f.to.x - f.from.x;
      const dy = f.to.y - f.from.y;
      const lift = Math.min(120, 30 + Math.hypot(dx, dy) * 0.2);
      const at = (t: number, up: number, scale: number) =>
        `translate(${f.from.x + dx * t}px, ${f.from.y + dy * t - up}px) translate(-50%, -50%) scale(${scale})`;
      const anim = el.animate(
        [
          { transform: at(0, 0, 0.4), opacity: 0 },
          { transform: at(0.08, lift * 0.3, 1.1), opacity: 1, offset: 0.15 },
          { transform: at(0.5, lift, 1), opacity: 1, offset: 0.5 },
          { transform: at(1, 0, 0.6), opacity: 0.3 },
        ],
        {
          duration: 700 * k,
          delay: i * 70 * k,
          easing: 'cubic-bezier(.4,0,.2,1)',
          fill: 'both',
        },
      );
      anim.onfinish = () => el.remove();
      anim.oncancel = () => el.remove();
    });

    if (cue) {
      const el = document.createElement('div');
      el.className = 'turn-cue';
      el.textContent = cue;
      root.appendChild(el);
      const anim = el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.75 },
          { transform: 'translate(-50%, -60%) scale(1)', opacity: 0 },
        ],
        { duration: 1300 * Math.max(k, 0.7), delay: flights.length ? 300 * k : 0, fill: 'both' },
      );
      anim.onfinish = () => el.remove();
      anim.oncancel = () => el.remove();
    }
  }, [log]);

  return <div ref={layer} className="flights" aria-hidden="true" />;
}
