import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../../../server/src/protocol.ts';
import { changedOptions } from './settingsPatch.ts';

describe('lobby settings', () => {
  it('sends only the option the host just changed', () => {
    const after = { ...DEFAULT_OPTIONS, gifting: true };
    expect(changedOptions(DEFAULT_OPTIONS, after)).toEqual({ gifting: true });
  });

  it('sends nothing when nothing changed', () => {
    expect(changedOptions(DEFAULT_OPTIONS, { ...DEFAULT_OPTIONS })).toEqual({});
  });

  it('does not carry a stale value for an option someone else changed', () => {
    // The host's copy still says 7, the room has since moved to 9: a change to
    // another option must not take the limit back with it.
    const stale = { ...DEFAULT_OPTIONS, discardLimit: 7 };
    const patch = changedOptions(stale, { ...stale, friendlyRobber: true });
    expect(patch).toEqual({ friendlyRobber: true });
    expect(patch.discardLimit).toBeUndefined();
  });
});
