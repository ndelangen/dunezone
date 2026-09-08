import { describe, expect, test } from 'vitest';

import { playSearch } from './search';

describe('local table seat search', () => {
  test.each([undefined, '', 'many', 3, 7, null])('defaults unsupported count %s to six seats', (seats) => {
    expect(playSearch({ seats }).seats).toBe(6);
  });

  test.each([4, 5, 6])('accepts %s seats', (seats) => {
    expect(playSearch({ seats }).seats).toBe(seats);
    expect(playSearch({ seats: String(seats) }).seats).toBe(seats);
  });

  test('does not interpret connection or identity parameters', () => {
    expect(playSearch({ multiplayer: 1, role: 'alice', game: 'foo' })).toEqual({ seats: 6 });
  });
});
