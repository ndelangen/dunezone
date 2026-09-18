import { describe, expect, test } from 'vitest';

import { tablePieceSchema, tableRosterSchema, tableSeatSchema } from './schema';

const piece = {
  id: 'piece',
  label: 'Piece',
  color: '#000',
  accent: '#fff',
  items: [],
  stackKey: null,
  position: [0, 0, 0],
  orientation: 0,
  zoneId: null,
  locked: false,
  kind: 'force',
};
const seat = (id: string, position: number, faction: string | null = id) => ({
  id,
  position,
  faction: faction === null ? null : { id: faction, name: faction, color: '#fff' },
});

describe('seat and faction identities', () => {
  test('the two reserved words are sentinels on their own side and never an identity', () => {
    expect(tableSeatSchema.parse('neutral')).toBe('neutral');
    expect(tableSeatSchema.safeParse('shared').success).toBe(false);
    expect(tablePieceSchema.parse({ ...piece, owner: 'shared' }).owner).toBe('shared');
    expect(tablePieceSchema.safeParse({ ...piece, owner: 'neutral' }).success).toBe(false);
    for (const word of ['neutral', 'shared']) {
      expect(tableRosterSchema.safeParse({ seatCount: 2, seats: [seat(word, 0)] }).success).toBe(false);
      expect(tableRosterSchema.safeParse({ seatCount: 2, seats: [seat('seat-1', 0, word)] }).success).toBe(false);
    }
  });

  test('a roster keeps every seat at its own station below the count and every faction on one seat', () => {
    expect(tableRosterSchema.safeParse({ seatCount: 2, seats: [seat('a', 0), seat('b', 1, null)] }).success).toBe(true);
    expect(tableRosterSchema.safeParse({ seatCount: 2, seats: [seat('a', 2)] }).success).toBe(false);
    expect(tableRosterSchema.safeParse({ seatCount: 3, seats: [seat('a', 0), seat('b', 0)] }).success).toBe(false);
    expect(tableRosterSchema.safeParse({ seatCount: 3, seats: [seat('a', 0), seat('a', 1)] }).success).toBe(false);
    expect(tableRosterSchema.safeParse({ seatCount: 3, seats: [seat('a', 0, 'x'), seat('b', 1, 'x')] }).success).toBe(
      false
    );
    expect(tableRosterSchema.safeParse({ seatCount: 1, seats: [] }).success).toBe(false);
    expect(tableRosterSchema.safeParse({ seatCount: 19, seats: [] }).success).toBe(false);
  });
});
