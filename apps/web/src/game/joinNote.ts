import type { RoomSummary } from '../online/api.ts';

/**
 * What to tell someone opening an invite link, before they type a name: how
 * busy the room is, and whether they are about to join as a watcher.
 */
export function joinNote(room: RoomSummary | null): string {
  if (!room) return 'Looking for the room\u2026';
  if (!room.exists) return 'No room with this code. Check the link, or ask for a new one.';
  if (room.status !== 'lobby') {
    return room.status === 'finished'
      ? 'That game has finished. You can watch what happened, or wait for the next one.'
      : 'The game has already started, so you will watch until it ends.';
  }
  if (room.players >= room.maxPlayers)
    return `All ${room.maxPlayers} seats are taken, so you will watch unless one opens up.`;
  const free = room.maxPlayers - room.players;
  return `${room.players} of ${room.maxPlayers} seats taken, so there is room for you (${free} free).`;
}
