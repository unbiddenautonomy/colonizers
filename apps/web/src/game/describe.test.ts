import { describe as group, expect, it } from 'vitest';
import type { GameEvent } from '@colonizers/engine';
import { describe, discardReason } from './describe.ts';

const NAMES = ['Ada', 'Bo', 'Cy'];
const line = (e: Record<string, unknown>) => describe(e as unknown as GameEvent, NAMES);

group('describe', () => {
  it('names the step the engine skipped', () => {
    expect(line({ type: 'stepSkipped', step: 'moveRobber' })).toContain('skipped it');
  });

  // Seven events used to leave the log silent, so a player saw their turn change
  // with nothing to say why.
  it('follows the barbarian ship when a card moves it', () => {
    expect(line({ type: 'barbariansAdvance', at: 5, of: 7 })).toBe(
      '⚔️ The barbarian ship moved: 2 steps from Catan.',
    );
    expect(line({ type: 'barbariansAdvance', at: 6, of: 7 })).toContain('1 step from Catan');
    expect(line({ type: 'barbariansAdvance', at: 0, of: 7 })).toContain('back at the start');
    expect(line({ type: 'barbariansAdvance', at: 7, of: 7 })).toContain('reached Catan');
  });

  it('says a roll is waiting on a wonder', () => {
    expect(line({ type: 'wonderDiceHeld', player: 1, a: 3, b: 4 })).toBe(
      '🏛️ Bo threw 3 and 4, and may use a wonder before it counts.',
    );
  });

  it('says Russia placed the robber', () => {
    expect(line({ type: 'civMuscovyHex', player: 2, hex: 'h1' })).toContain(
      'Cy put the robber on the number they threw',
    );
  });

  it('lists the cards a swap offers', () => {
    const text = line({ type: 'civSwapReady', player: 0, cards: ['grain', 'ore'] }) ?? '';
    expect(text).toContain('Ada may swap one card from this roll');
    expect(text.split(',').length).toBe(2);
  });

  it('follows a wagon with no toll to pay', () => {
    expect(line({ type: 'wagonMoved', player: 0, from: 'c1', to: 'c2' })).toBe(
      '🛒 Ada moved their wagon.',
    );
    expect(line({ type: 'wagonMoved', player: 0, from: 'c1', to: 'c2', tollTo: 1 })).toContain(
      'paid Bo 1 gold',
    );
  });

  it('says who the bank owes cards to', () => {
    expect(line({ type: 'lwPickOwed', owed: { 0: 2, 1: 1 } })).toBe(
      '🌊 From the bank: Ada 2 cards, Bo 1 card, each of their choice.',
    );
  });

  it('says what the discard box is for', () => {
    expect(discardReason('seven')).toBe('A 7 was rolled and you hold too many cards.');
    // The box used to name the Saboteur even in a game without Cities & Knights.
    expect(discardReason(undefined)).toBe('A 7 was rolled and you hold too many cards.');
    expect(discardReason('saboteur')).toBe(
      'Saboteur was played against you: half your hand goes back.',
    );
    expect(discardReason('census')).toContain('Census was played against you');
  });

  it('leaves the engine’s own bookkeeping out of the log', () => {
    expect(line({ type: 'phase', to: 'moveRobber' })).toBeNull();
  });
});
