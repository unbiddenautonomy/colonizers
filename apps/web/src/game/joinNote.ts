import type { RoomSummary } from '../online/api.ts';

/**
 * What to tell someone opening an invite link, before they type a name: how
 * busy the room is, and whether they are about to join as a watcher.
 */
export function joinNote(room: RoomSummary | null, online = true): string {
  if (!online)
    return 'You are offline, so this room cannot be opened yet. It will load when you are back.';
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

/**
 * What to tell someone when a call to the server failed. Being offline is by
 * far the commonest reason, and "Failed to fetch" tells nobody anything.
 */
export function networkMessage(error: unknown, online: boolean): string {
  if (!online)
    return 'You are offline. Online games need a connection, but you can still play on this device.';
  const text = error instanceof Error ? error.message : '';
  if (!text || /fetch|network|load failed|connection/i.test(text))
    return 'The server did not answer. Check your connection and try again.';
  return text;
}
