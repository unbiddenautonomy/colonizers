import { describe, expect, it } from 'vitest';
import { scrollEdges } from './scrollHint.ts';

describe('the fade on a strip that scrolls', () => {
  it('shows nothing when everything fits', () => {
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toEqual({
      left: false,
      right: false,
    });
  });

  it('shows the end with more to come', () => {
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 900, clientWidth: 300 })).toEqual({
      left: false,
      right: true,
    });
    expect(scrollEdges({ scrollLeft: 300, scrollWidth: 900, clientWidth: 300 })).toEqual({
      left: true,
      right: true,
    });
    expect(scrollEdges({ scrollLeft: 600, scrollWidth: 900, clientWidth: 300 })).toEqual({
      left: true,
      right: false,
    });
  });

  it('ignores a pixel or two, which rounding leaves behind', () => {
    expect(scrollEdges({ scrollLeft: 2, scrollWidth: 902, clientWidth: 900 })).toEqual({
      left: false,
      right: false,
    });
  });
});
