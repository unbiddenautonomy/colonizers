import { describe, expect, it } from 'vitest';
import type { Action } from '@colonizers/engine';
import { spotLabel } from './spotLabel.ts';

const label = (a: Record<string, unknown>) => spotLabel(a as unknown as Action);

describe('what a spot on the board is for', () => {
  it('names the piece an action builds', () => {
    expect(label({ type: 'buildSettlement', corner: 'c1' })).toBe('Build a settlement');
    expect(label({ type: 'buildRoad', edge: 'e1' })).toBe('Build a road');
    expect(label({ type: 'buildCity', corner: 'c1' })).toBe('Build a city');
  });

  it('uses the words the game uses for a piece', () => {
    expect(label({ type: 'build', piece: 'ferry', edge: 'e1' })).toBe('Build a ship');
    expect(label({ type: 'build', piece: 'wall', corner: 'c1' })).toBe('Build a city wall');
  });

  it('says "the" where there is only one of something', () => {
    expect(label({ type: 'moveRobber', hex: 'h1' })).toBe('Move the robber');
    expect(label({ type: 'placeJunker', hex: 'h1' })).toBe('Place the junker');
  });

  it('falls back to the action it is, rather than "Build here"', () => {
    expect(label({ type: 'selectKnight', edge: 'e1' })).toBe('Select a knight');
    expect(label({ type: 'explore' })).toBe('Explore');
  });

  it('says the awkward ones plainly', () => {
    expect(label({ type: 'placeSetupSettlement', corner: 'c1' })).toBe('Place a settlement');
    expect(label({ type: 'placeSetupRoad', edge: 'e1' })).toBe('Place a road');
    expect(label({ type: 'placeFreeRoad', edge: 'e1' })).toBe('Place a free road');
  });

  it('gets the article right before a vowel', () => {
    expect(label({ type: 'buildAqueduct' })).toBe('Build an aqueduct');
  });
});
