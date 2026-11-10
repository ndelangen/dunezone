import { describe, expect, it } from 'vite-plus/test';

import type { TableRoster } from '../../src/shared/play/schema';
import { nudgeTarget } from './nudges';

const roster: TableRoster = {
  seatCount: 4,
  seats: [
    { id: 'seat-1', position: 0, faction: { id: 'atreides', name: 'Atreides', color: '#fff' } },
    { id: 'seat-2', position: 1, faction: { id: 'harkonnen', name: 'House Harkonnen', color: '#fff' } },
    { id: 'seat-3', position: 2, faction: { id: 'fremen', name: 'Fremen', color: '#fff' } },
    { id: 'seat-4', position: 3, faction: { id: 'ixians', name: 'Ixians', color: '#fff' } },
  ],
};
const occupants = [
  { seat: 'seat-1', userId: 'a', name: 'Alice' },
  { seat: 'seat-2', userId: 'b', name: 'Bob' },
  { seat: 'seat-3', userId: 'c', name: 'Carol' },
];
const match = (text: string, peer = '@table', people = occupants) =>
  nudgeTarget(text, 'atreides', peer, roster, people);

describe('Exact conversation nudge names', () => {
  it('accepts the whole faction or current player name with an optional marker or command', () => {
    for (const text of [
      'House Harkonnen',
      '  house harkonnen  ',
      '@HOUSE HARKONNEN',
      '/nudge House Harkonnen',
      '/NUDGE @bOb',
      'Bob',
    ]) {
      expect(match(text, 'harkonnen')).toMatchObject({ seat: 'seat-2', userId: 'b' });
    }
    expect(match('/nudge Carol')).toMatchObject({ seat: 'seat-3', userId: 'c' });
  });
  it('ignores partial names, extra prose, empty seats, own names, another pair and recall', () => {
    for (const text of [
      'Harkonnen',
      'House Harkonnen!',
      'Hi Bob',
      'Bob hi',
      '',
      '@',
      '/nudge',
      'Ixians',
      'Alice',
      'Atreides',
    ]) {
      expect(match(text)).toBeUndefined();
    }
    expect(match('Carol', 'harkonnen')).toBeUndefined();
    expect(match('Bob', '@recall:one')).toBeUndefined();
  });
  it('rejects collisions anywhere in the occupied roster, including a sender or a different pair', () => {
    expect(match('Bob', 'harkonnen', [...occupants.slice(0, 2), { ...occupants[2], name: 'Bob' }])).toBeUndefined();
    expect(
      match('House Harkonnen', 'harkonnen', [{ ...occupants[0], name: 'House Harkonnen' }, ...occupants.slice(1)])
    ).toBeUndefined();
    expect(
      match('Bob', 'harkonnen', [occupants[0], { ...occupants[1], name: 'House Harkonnen' }, occupants[2]])
    ).toBeUndefined();
    expect(
      match('House Harkonnen', 'harkonnen', [occupants[0], { ...occupants[1], name: 'House Harkonnen' }, occupants[2]])
    ).toMatchObject({ userId: 'b' });
  });
});
