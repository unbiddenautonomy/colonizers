import { describe, expect, it } from 'vitest';
import type { CornerId } from '@colonizers/engine';
import { generateSeaBoard } from '@colonizers/maps';
import { ckData } from '@colonizers/module-cities-knights';
import { act, ctxOf, edit, finishSetup, game, lib, pick } from './helpers.ts';

/**
 * Steps that used to dead-end: nobody could move, nobody had won, and the
 * game stopped for good. Each one is now closed by its own rule; the engine's
 * rescue move is only the net under them.
 */

const OTHERS = ['kongo', 'morocco', 'mali'];

/** The steps where a roll is held for someone to throw again. */
const HOLDS = ['civDemocracy', 'indulgence'];

describe('Civilisations dead ends', () => {
  it('Inuit: a 7 that leaves nobody owing cards does not hold the game up', () => {
    let s = finishSetup(pick(game('inuit-7'), ['inuit', ...OTHERS]));
    s = edit(s, (c) => {
      c.state.turn.player = 0;
      c.setPhase({ id: 'roll' });
      // The Inuit keep wool and cloth out of their hand count, so the base
      // rule asks them to discard and their own rule asks for nothing.
      for (const p of c.state.players) p.hand = {};
      c.grant(0, { wool: 5, cloth: 3, brick: 1 });
      ckData(c).alchemist = { red: 3, yellow: 4 };
    });

    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).not.toBe('discard');
    expect(lib.stuck(s)).toBe(false);
    expect(lib.waitingOn(s).length).toBeGreaterThan(0);
  });

  it('Papua: has somewhere to start when everyone starts on the home island', () => {
    const board = generateSeaBoard({ seed: 'papua', players: 4, scenario: 'new-shores' });
    const start = lib.createGame({
      seed: 'papua',
      players: ['A', 'B', 'C', 'D'],
      modules: ['base', 'seafarers', 'cities-knights', 'greed-wealth-power', 'civilisations'],
      map: board.map,
      settings: { ...board.settings, wonderToWin: false },
      fixedSeats: true,
    }).state;
    expect((start.settings.setupHexes as CornerId[]).length).toBeGreaterThan(0);

    const s = pick(start, ['papua', ...OTHERS]);
    const papua = finishSetup(s);
    expect(papua.phase.id).not.toBe('setup');
    expect(ctxOf(papua).piecesOf(0, 'settlement').length).toBeGreaterThan(0);
  });

  it('Greece and an Indulgence hand the same roll back and forth only once', () => {
    let s = finishSetup(pick(game('greece-indulgence'), ['greece', ...OTHERS]));
    s = edit(s, (c) => {
      c.state.turn.player = 0;
      c.setPhase({ id: 'roll' });
      // Greece's second throw comes with its 10-point ability.
      (c.state.data.civilisations as { unlocked: Record<number, boolean> }).unlocked[0] = true;
      c.player(1).held.religion = [{ card: 'indulgence', acquiredTurn: 0 }];
    });
    s = act(s, { type: 'roll', player: 0 });

    // Each power holds the roll once; neither may hold it again, so the two
    // can't keep handing the same roll to each other.
    const held: string[] = [];
    for (let i = 0; i < 12 && HOLDS.includes(s.phase.id); i++) {
      held.push(s.phase.id);
      const seat = lib.waitingOn(s)[0]!;
      const options = lib.legalActions(s, seat);
      const letStand = options.find(
        (a) => a.type === 'passIndulgence' || (a.type === 'civDemocracy' && a.dice === 'keep'),
      );
      s = act(s, letStand ?? options[0]!);
    }
    expect(held).toEqual(['civDemocracy', 'indulgence']);
    expect(HOLDS).not.toContain(s.phase.id);
    expect(lib.stuck(s)).toBe(false);
  });
});
