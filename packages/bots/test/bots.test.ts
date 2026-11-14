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

  it('plays World Wonders, and wins with a finished wonder', () => {
    const r = play(
      game('w1', 4, 'base', {}, ['world-wonders']),
      [medium, medium, medium, medium],
      3,
      9000,
    );
    expect(r.winner).not.toBeNull();
    const wonders = (
      r.state.data['world-wonders'] as {
        wonders: Record<string, { owner: number; stages: number }>;
      }
    ).wonders;
    expect(Object.values(wonders).some((w) => w.owner === r.winner && w.stages === 4)).toBe(true);
  }, 120_000);

  it('plays World Wonders with Cities & Knights', () => {
    const r = play(
      game('wc1', 4, 'ck', { vpTarget: 13 }, ['world-wonders']),
      [medium, medium, medium, medium],
      4,
      9000,
    );
    expect(r.winner).not.toBeNull();
  }, 180_000);

  it('plays Civilisations on Greed, Wealth & Power', () => {
    // A shorter game than the real 20 points, to keep the test quick.
    const r = play(
      game('cv1', 4, 'gwp', { vpTarget: 16 }, ['civilisations']),
      [medium, medium, medium, medium],
      5,
      9000,
    );
    expect(r.winner).not.toBeNull();
    const d = r.state.data.civilisations as { civ: Record<number, string> };
    expect(Object.keys(d.civ)).toHaveLength(4);
  }, 240_000);

  it('plays Church, Faith & Reformation', () => {
    const r = play(
      game('kg1', 4, 'ck', { vpTarget: 15 }, ['church']),
      [medium, medium, medium, medium],
      7,
      9000,
    );
    expect(r.winner).not.toBeNull();
    const d = r.state.data['cities-knights'] as { seats?: { diocese?: Record<number, string> } };
    expect(Object.keys(d.seats?.diocese ?? {}).length).toBeGreaterThan(0);
  }, 240_000);

  it('plays Witches, Wizards & Dragons', () => {
    const r = play(
      game('hz1', 4, 'ck', { vpTarget: 15 }, ['witches']),
      [medium, medium, medium, medium],
      5,
      9000,
    );
    expect(r.winner).not.toBeNull();
    const d = r.state.data['cities-knights'] as { seats?: Record<string, object> };
    expect(Object.keys(d.seats?.citadel ?? {}).length).toBeGreaterThan(0);
  }, 240_000);

  it('plays Church and Witches together', () => {
    const r = play(
      game('kh1', 4, 'ck', { vpTarget: 17 }, ['witches', 'church']),
      [medium, medium, medium, medium],
      9,
      9000,
    );
    expect(r.winner).not.toBeNull();
    const d = r.state.data['cities-knights'] as { seats?: Record<string, object> };
    expect(Object.keys(d.seats?.citadel ?? {}).length).toBeGreaterThan(0);
  }, 240_000);

  it('plays Princes & Explorers', () => {
    const r = play(
      game('pf1', 4, 'base', { vpTarget: 14 }, ['princes']),
      [medium, medium, medium, medium],
      3,
      9000,
    );
    expect(r.winner).not.toBeNull();
    const princes = Object.values(r.state.pieces).filter((p) => p.type === 'prince');
    expect(princes).toHaveLength(4);
  }, 240_000);

  it('plays Princes & Explorers with Seafarers', () => {
    const r = play(
      game('pf3', 4, 'sea', {}, ['princes']),
      [medium, medium, medium, medium],
      6,
      9000,
    );
    expect(r.winner).not.toBeNull();
  }, 240_000);

  it('plays Princes & Explorers with Cities & Knights', () => {
    const r = play(
      game('pf2', 4, 'ck', { vpTarget: 17 }, ['princes']),
      [medium, medium, medium, medium],
      4,
      9000,
    );
    expect(r.winner).not.toBeNull();
  }, 240_000);

  it('plays Soldiers & Armies', () => {
    const r = play(
      game('sa1', 4, 'base', { vpTarget: 13 }, ['soldiers']),
      [medium, medium, medium, medium],
      5,
      9000,
    );
    expect(r.winner).not.toBeNull();
  }, 240_000);

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
