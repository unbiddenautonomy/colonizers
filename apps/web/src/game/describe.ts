import type { GameEvent } from '@colonizers/engine';
import { nameOf } from '@colonizers/rulebook';

function cards(c: Record<string, number> | undefined): string {
  if (!c) return '';
  const parts = Object.entries(c)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${nameOf(k).icon ?? nameOf(k).name}`);
  return parts.join(', ') || 'nothing';
}

/** One line of log text for an event, or null to leave it out. */
export function describe(e: GameEvent, names: string[]): string | null {
  const n = (seat: unknown) =>
    typeof seat === 'number' ? (names[seat] ?? `Player ${seat + 1}`) : 'Someone';
  switch (e.type) {
    case 'gameCreated':
      return 'New game started.';
    case 'turnStarted':
      return `— ${n(e.player)}'s turn —`;
    case 'rolled':
      return `${n(e.player)} rolled ${e.total as number}.`;
    case 'production': {
      const received = e.received as Record<number, Record<string, number>>;
      const lines = Object.entries(received).map(
        ([seat, c]) => `${n(Number(seat))} got ${cards(c)}`,
      );
      const short = (e.shortages as string[]).length
        ? ` Bank ran out of ${(e.shortages as string[]).join(', ')}.`
        : '';
      return lines.length ? lines.join('; ') + '.' + short : `Nobody collected anything.${short}`;
    }
    case 'built':
      return `${n(e.player)} built a ${e.piece as string}${e.free ? ' (free)' : ''}.`;
    case 'startingResources':
      return `${n(e.player)} starts with ${cards(e.cards as Record<string, number>)}.`;
    case 'discarded':
      return `${n(e.player)} discarded ${cards(e.cards as Record<string, number>)}.`;
    case 'robberMoved':
      return `${n(e.player)} moved the robber.`;
    case 'stole':
      return e.card
        ? `${n(e.thief)} stole ${cards({ [e.card as string]: 1 })} from ${n(e.victim)}.`
        : `${n(e.thief)} stole a card from ${n(e.victim)}.`;
    case 'boughtDevCard':
      return `${n(e.player)} bought a development card.`;
    case 'playedDevCard':
      return `${n(e.player)} played ${nameOf(e.card as string).name}.`;
    case 'yearOfPlenty':
      return `${n(e.player)} took ${cards(e.cards as Record<string, number>)}.`;
    case 'monopoly':
      return `${n(e.player)} took ${e.taken as number} ${nameOf(e.resource as string).icon ?? ''} from everyone.`;
    case 'bankTrade':
      return `${n(e.player)} traded ${cards(e.gave as Record<string, number>)} with the bank for ${cards(e.got as Record<string, number>)}.`;
    case 'tradeOffered': {
      const o = e.offer as {
        from: number;
        give: Record<string, number>;
        get: Record<string, number>;
      };
      return `${n(o.from)} offers ${cards(o.give)} for ${cards(o.get)}.`;
    }
    case 'tradeResponse':
      return `${n(e.player)} ${e.accept ? 'accepts' : 'declines'}.`;
    case 'traded':
      return `${n(e.from)} and ${n(e.to)} traded ${cards(e.gave as Record<string, number>)} for ${cards(e.got as Record<string, number>)}.`;
    case 'tradeCancelled':
      return 'Trade offer withdrawn.';
    case 'award': {
      const label = e.award === 'longestRoad' ? 'Longest Road' : 'Largest Army';
      return e.to === null ? `Nobody holds ${label} now.` : `${n(e.to)} takes ${label}!`;
    }
    case 'gameOver':
      return `🏆 ${n(e.winner)} wins!`;
    default:
      return null;
  }
}
