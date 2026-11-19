import { describe, expect, it } from 'vitest';
import { joinNote, networkMessage } from './joinNote.ts';

describe('what an invite link says before you join', () => {
  it('waits for the answer', () => {
    expect(joinNote(null)).toBe('Looking for the room…');
  });

  it('says when there is no such room', () => {
    expect(joinNote({ exists: false, status: null, players: 0, maxPlayers: 0 })).toContain(
      'No room with this code',
    );
  });

  it('says how many seats are left', () => {
    expect(joinNote({ exists: true, status: 'lobby', players: 2, maxPlayers: 4 })).toBe(
      '2 of 4 seats taken, so there is room for you (2 free).',
    );
  });

  it('warns that a full table means watching', () => {
    expect(joinNote({ exists: true, status: 'lobby', players: 4, maxPlayers: 4 })).toContain(
      'you will watch',
    );
  });

  it('warns that a game in play means watching', () => {
    expect(joinNote({ exists: true, status: 'playing', players: 3, maxPlayers: 4 })).toContain(
      'already started',
    );
  });

  it('says when the game is over', () => {
    expect(joinNote({ exists: true, status: 'finished', players: 3, maxPlayers: 4 })).toContain(
      'finished',
    );
  });
});

describe('when the server cannot be reached', () => {
  it('says so plainly when the device is offline', () => {
    expect(joinNote({ exists: true, status: 'lobby', players: 1, maxPlayers: 4 }, false)).toContain(
      'You are offline',
    );
    expect(networkMessage(new Error('Failed to fetch'), false)).toContain('You are offline');
  });

  it('turns a fetch failure into something a person can act on', () => {
    expect(networkMessage(new Error('Failed to fetch'), true)).toBe(
      'The server did not answer. Check your connection and try again.',
    );
  });

  it('keeps a message the server itself sent', () => {
    expect(networkMessage(new Error('That room is full'), true)).toBe('That room is full');
  });
});
