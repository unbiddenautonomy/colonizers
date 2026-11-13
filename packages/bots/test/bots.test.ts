import { describe, expect, it } from 'vitest';
import { chooseAction, newMemory, type BotConfig } from '../src/index.ts';
import { game, lib, play, rng } from './play.ts';

const medium: BotConfig = { level: 'medium', style: 'balanced' };

describe('Bots', () => {
  it('three Medium bots and an Easy one finish a base game', () => {
    const r = play(
      game('b1', 4, 'base'),
      [medium, medium, medium, { level: 'easy', style: 'balanced' }],
      1,
    );
    expect(r.winner).not.toBeNull();
  }, 120_000);

  it('every play style finishes a game', () => {
    const r = play(
      game('b2', 4, 'base'),
      [
        { level: 'medium', style: 'builder' },
        { level: 'medium', style: 'city' },
        { level: 'medium', style: 'army' },
        { level: 'medium', style: 'trader' },
      ],
      2,
    );
    expect(r.winner).not.toBeNull();
  }, 120_000);

  it('plays Seafarers', () => {
    const r = play(game('s1', 4, 'sea'), [medium, medium, medium, medium], 3);
    expect(r.winner).not.toBeNull();
  }, 120_000);

  it('plays Cities & Knights', () => {
    const r = play(game('c1', 4, 'ck'), [medium, medium, medium, medium], 4, 9000);
    expect(r.winner).not.toBeNull();
  }, 180_000);

  it('plays Seafarers with Cities & Knights', () => {
    const r = play(game('sc1', 3, 'sea-ck'), [medium, medium, medium], 5, 9000);
    expect(r.winner).not.toBeNull();
  }, 180_000);

  it('plays Greed, Wealth & Power, river and all', () => {
    const r = play(
      game('g2', 4, 'gwp', { gwpRiver: true }),
      [medium, medium, medium, medium],
      7,
      9000,
    );
    expect(r.winner).not.toBeNull();
    const built = (r.state.data['greed-wealth-power'] as { buildings?: Record<number, object> })
      .buildings;
    // Somebody put up a special building on the way.
    expect(Object.values(built ?? {}).some((b) => Object.keys(b).length > 0)).toBe(true);
  }, 180_000);

  it('only sees what its seat may see', () => {
    // The same visible position gives the same move whatever is hidden.
    const s = game('h1', 4, 'base');
    let t = s;
    const rand = rng(9);
    while (t.phase.id === 'setup')
      t = lib.apply(
        t,
        chooseAction(lib, t, lib.waitingOn(t)[0]!, medium, newMemory(), { rand })!,
      ).state;
    const other = structuredClone(t);
    // Shuffle what the bot can't see: another player's hand and the deck order.
    const seat = t.turn.player;
    const opp = (seat + 1) % 4;
    other.players[opp]!.hand = { ore: 2 };
    t.players[opp]!.hand = { brick: 2 };
    other.decks.dev = [...(other.decks.dev ?? [])].reverse();
    const a = chooseAction(lib, t, seat, medium, newMemory(), { rand: rng(1) });
    const b = chooseAction(lib, other, seat, medium, newMemory(), { rand: rng(1) });
    expect(a).toEqual(b);
  });
});
