import { describe, expect, it } from 'vite-plus/test';

import { parseLeaderStrength } from './LeaderStrengthInput';

describe('parseLeaderStrength', () => {
  it('reads blank as no strength, digits as a number and one other character as printed', () => {
    expect(parseLeaderStrength('')).toEqual({ value: undefined });
    expect(parseLeaderStrength('-2')).toEqual({ value: -2 });
    expect(parseLeaderStrength('X')).toEqual({ value: 'X' });
  });

  it('refuses anything else', () => {
    expect(parseLeaderStrength('10x')).toBeNull();
    expect(parseLeaderStrength('ab')).toBeNull();
  });
});
