import { describe, expect, test } from 'vite-plus/test';

import type { TablePiece } from './model';
import type { TableRoster } from './schema';
import { factionSupplyLayout } from './setupLayout';
import { tableSeatAngles } from './tableSettings';
import { troopFactionOf, troopReserveKeys, troopReserveSpots } from './troopReserves';

const troop = (stackKey: string, kind: TablePiece['kind'] = 'force') => ({ kind, stackKey }) as TablePiece;

describe('troopFactionOf', () => {
  test('reads the faction off a dealt troop stack', () => {
    expect(troopFactionOf(troop('troops:fremen:fedaykin'))).toBe('fremen');
  });

  test('is undefined for leaders, tokens, cards and nothing', () => {
    expect(troopFactionOf(troop('leader:fremen:stilgar'))).toBeUndefined();
    expect(troopFactionOf(troop('faction-token:fremen'))).toBeUndefined();
    expect(troopFactionOf(troop('troops:fremen:x', 'card'))).toBeUndefined();
    expect(troopFactionOf(undefined)).toBeUndefined();
  });
});

describe('troopReserveKeys', () => {
  const pieces = [
    troop('troops:fremen:b'),
    troop('troops:fremen:a'),
    troop('troops:fremen:b'),
    troop('troops:emperor:a'),
  ];

  test('without the dealt order, the faction’s kinds in the order the table first lists them', () => {
    expect(troopReserveKeys(pieces, 'fremen')).toEqual(['troops:fremen:b', 'troops:fremen:a']);
  });

  test('the dealt order first, then any kind it does not name', () => {
    expect(troopReserveKeys(pieces, 'fremen', ['troops:fremen:b'])).toEqual(['troops:fremen:b', 'troops:fremen:a']);
  });
});

describe('troopReserveSpots', () => {
  const roster = {
    seatCount: 6,
    seats: [{ id: 'seat-1', position: 2, faction: { id: 'fremen' } }],
  } as unknown as TableRoster;

  test('the spots setup lays the reserves out on, in the order given', () => {
    const keys = ['troops:fremen:a', 'troops:fremen:b'];
    const { reserves } = factionSupplyLayout(tableSeatAngles(6)[2]!, 2);
    expect(troopReserveSpots(roster, 'fremen', keys)).toEqual([
      { stackKey: keys[0], position: reserves[0] },
      { stackKey: keys[1], position: reserves[1] },
    ]);
  });

  test('none for a faction with no seat, or no kinds', () => {
    expect(troopReserveSpots(roster, 'emperor', ['troops:emperor:a'])).toBeUndefined();
    expect(troopReserveSpots(roster, 'fremen', [])).toBeUndefined();
  });
});
