import type { LogEntry } from './useLocalGame.ts';

/** Where a log reader got to: the last entry it saw, or 'start' when it saw an empty log. */
export type LogMark = LogEntry | 'start';

export function logMark(log: readonly LogEntry[]): LogMark {
  return log[log.length - 1] ?? 'start';
}

/**
 * The entries added since `mark`. The log is capped (only the latest few hundred lines are
 * kept), so its length stops growing in long games: find the last entry seen instead, and
 * fall back to newer moves when the log was rebuilt (a reconnect).
 */
export function freshSince(log: readonly LogEntry[], mark: LogMark): LogEntry[] {
  if (mark === 'start') return [...log];
  const i = log.lastIndexOf(mark);
  if (i >= 0) return log.slice(i + 1);
  return log.filter((e) => e.seq > mark.seq);
}
