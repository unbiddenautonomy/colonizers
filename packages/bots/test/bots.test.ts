import { describe, expect, it } from 'vitest';
import type { GameState } from '@colonizers/engine';
import { chooseAction, newMemory, type BotConfig } from '../src/index.ts';
import { game, lib, play, rng } from './play.ts';

const medium: BotConfig = { level: 'medium', style: 'balanced' };

/** Plays the setup, then puts the given seat in the main phase. */
function toMain(state: GameState, seed: number): GameState {
  let t = state;
  const rand = rng(seed);
  const mem = state.players.map(() => newMemory());
  while (t.phase.id !== 'main') {
    const seat = lib.waitingOn(t)[0]!;
    const a = chooseAction(lib, t, seat, medium, mem[seat]!, { rand });
    if (!a) throw new Error(`No move in ${t.phase.id}`);
    t = lib.apply(t, a).state;
  }
  return t;
}

/** Changes a copy of the state directly, for setting up test positions. */
function edit(state: GameState, fn: (s: GameState) => void): GameState {
  const next = structuredClone(state);
  fn(next);
  return next;
}

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

  it('plays Soldiers & Armies with Seafarers', () => {
    const r = play(
      game('sa2', 4, 'sea', {}, ['soldiers']),
      [medium, medium, medium, medium],
      7,
      9000,
    );
    expect(r.winner).not.toBeNull();
  }, 240_000);

  it('plays Soldiers & Armies with Cities & Knights', () => {
    const r = play(
      game('sa3', 4, 'ck', { vpTarget: 16 }, ['soldiers']),
      [medium, medium, medium, medium],
      8,
      9000,
    );
    expect(r.winner).not.toBeNull();
  }, 240_000);

  it('plays its knights instead of hoarding them', () => {
    let t = game('k1', 4, 'base');
    const rand = rng(5);
    const mem = [newMemory(), newMemory(), newMemory(), newMemory()];
    // Through the setup and into the first main phase.
    while (t.phase.id !== 'main') {
      const seat = lib.waitingOn(t)[0]!;
      t = lib.apply(t, chooseAction(lib, t, seat, medium, mem[seat]!, { rand })!).state;
    }
    const seat = t.turn.player;
    t.players[seat]!.held.dev = [{ card: 'knight', acquiredTurn: -1 }];
    const turn = t.turn.number;
    const played: string[] = [];
    while (t.turn.number === turn && t.winner === null) {
      const who = lib.waitingOn(t)[0]!;
      const a = chooseAction(lib, t, who, medium, mem[who]!, { rand });
      if (!a) break;
      if (a.type === 'playDevCard') played.push(String(a.card));
      t = lib.apply(t, a).state;
    }
    expect(played).toContain('knight');
  }, 60_000);

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

  it('completes a trade it offered, although it cannot see the other hand', () => {
    let t = toMain(game('t1', 4, 'base'), 7);
    const seat = t.turn.player;
    const other = (seat + 1) % 4;
    t = edit(t, (s) => {
      s.players[seat]!.hand = { brick: 3, lumber: 1 };
      s.players[other]!.hand = { ore: 3 };
      (s.data.base as Record<string, unknown>).trade = {
        id: 1,
        from: seat,
        give: { brick: 1 },
        get: { ore: 1 },
        to: null,
        responses: { [other]: 'accept' },
      };
    });
    const a = chooseAction(lib, t, seat, medium, newMemory(), { rand: rng(3) });
    expect(a).toMatchObject({ type: 'confirmTrade', player: seat, with: other });
    const after = lib.apply(t, a!).state;
    expect(after.players[seat]!.hand.ore).toBe(1);
  });

  it('does not always pick on the first seat when the choices are equal', () => {
    let t = toMain(game('s1', 4, 'base'), 11);
    const seat = t.turn.player;
    // Every other player holds the same hand, so stealing from any is the same.
    t = edit(t, (s) => {
      for (const p of s.players) p.hand = p.seat === seat ? { brick: 1 } : { ore: 2 };
      s.phase = {
        id: 'steal',
        candidates: s.players.filter((p) => p.seat !== seat).map((p) => p.seat),
        returnTo: 'main',
      };
    });
    const picked = new Set<number>();
    for (let i = 1; i <= 24; i++) {
      const a = chooseAction(lib, t, seat, medium, newMemory(), { rand: rng(i) });
      if (a?.type === 'steal') picked.add(a.from as number);
    }
    expect(picked.size).toBeGreaterThan(1);
  }, 60_000);

  it('plays a progress card instead of letting the next one go back', () => {
    let t = toMain(game('p1', 4, 'ck'), 13);
    const seat = t.turn.player;
    t = edit(t, (s) => {
      // A full progress hand: the next card drawn would go straight back.
      s.players[seat]!.held.trade = [
        { card: 'merchantFleet', acquiredTurn: -1 },
        { card: 'masterMerchant', acquiredTurn: -1 },
      ];
      s.players[seat]!.held.politics = [
        { card: 'bishop', acquiredTurn: -1 },
        { card: 'diplomat', acquiredTurn: -1 },
      ];
    });
    const played: string[] = [];
    const rand = rng(17);
    const mem = newMemory();
    const turn = t.turn.number;
    for (let i = 0; i < 30 && t.turn.number === turn && t.winner === null; i++) {
      const who = lib.waitingOn(t)[0]!;
      const a = chooseAction(lib, t, who, medium, who === seat ? mem : newMemory(), { rand });
      if (!a) break;
      if (a.type === 'playProgress' && a.player === seat) played.push(String(a.card));
      t = lib.apply(t, a).state;
    }
    expect(played.length).toBeGreaterThan(0);
  }, 60_000);
});
