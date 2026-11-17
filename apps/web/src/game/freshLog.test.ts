import { describe, expect, it } from 'vitest';
import { freshSince, logMark } from './freshLog.ts';
import type { LogEntry } from './useLocalGame.ts';

const entry = (seq: number): LogEntry => ({ seq, event: { type: 'x' } });

describe('freshSince', () => {
  it('finds new lines after the log is capped and stops growing', () => {
    const a = [entry(1), entry(2), entry(3)];
    const mark = logMark(a);
    const next = [...a.slice(1), entry(4)];
    expect(next.length).toBe(a.length);
    expect(freshSince(next, mark)).toEqual([entry(4)]);
  });

  it('falls back to newer moves when the log was rebuilt', () => {
    const mark = logMark([entry(1), entry(2)]);
    expect(freshSince([entry(1), entry(2), entry(3)], mark).map((e) => e.seq)).toEqual([3]);
  });

  it('treats everything as new after an empty log', () => {
    expect(freshSince([entry(1)], logMark([]))).toHaveLength(1);
  });
});
