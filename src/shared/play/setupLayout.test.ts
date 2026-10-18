import { describe, expect, test } from 'vite-plus/test';

import type { TablePiece } from './model';
import { factionSupplyLayout, supplyReserveReach, widestTroopSupply } from './setupLayout';
import { CARD_BAY_PLACEMENT_ANCHORS, CARD_SLOT_OUTER_SIZE } from './tableFurnitureLayout';
import { FACTION_TOKEN_SCALE, TROOP_FOOTPRINT_RADIUS } from './tableGeometry';
import { TABLE_SEAT_COUNTS, tableSeatAngles } from './tableSettings';

/* How far a disc reaches into a well's outline; zero or less means clear. */
function wellOverlap([x, , z]: readonly number[], radius: number) {
  return Math.max(
    ...CARD_BAY_PLACEMENT_ANCHORS.map(({ position }) => {
      const dx = Math.max(0, Math.abs(x! - position[0]) - CARD_SLOT_OUTER_SIZE.width / 2);
      const dz = Math.max(0, Math.abs(z! - position[2]) - CARD_SLOT_OUTER_SIZE.depth / 2);
      return radius - Math.hypot(dx, dz);
    })
  );
}

describe('faction supply at every table size', () => {
  test.each(TABLE_SEAT_COUNTS)(
    '%i seats keep tokens and reserves behind their seats, out of the card wells and off each other',
    (seats) => {
      /* Three troop kinds is the most a faction brings. */
      const discs = tableSeatAngles(seats).flatMap((angle) => {
        const { token, reserves } = factionSupplyLayout(angle, 3);
        return [
          { position: token.position, radius: TROOP_FOOTPRINT_RADIUS * FACTION_TOKEN_SCALE },
          ...reserves.map((position) => ({ position, radius: TROOP_FOOTPRINT_RADIUS })),
        ];
      });
      for (const disc of discs) {
        expect(wellOverlap(disc.position, disc.radius)).toBeLessThanOrEqual(0);
      }
      discs.forEach((disc, index) => {
        for (const other of discs.slice(index + 1)) {
          const gap = Math.hypot(disc.position[0] - other.position[0], disc.position[2] - other.position[2]);
          expect(gap).toBeGreaterThanOrEqual(disc.radius + other.radius - 1e-9);
        }
      });
    }
  );
});

describe('the reach the table frames around reserves', () => {
  test.each([1, 2, 3, 4, 5, 6])('covers every reserve of a faction with %i troop kinds', (kinds) => {
    const angle = 0.7;
    const { radius, halfWidth } = supplyReserveReach(kinds);
    const centre = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    for (const [x, , z] of factionSupplyLayout(angle, kinds).reserves) {
      expect(Math.hypot(x - centre[0]!, z - centre[1]!) + TROOP_FOOTPRINT_RADIUS).toBeLessThanOrEqual(halfWidth + 1e-9);
    }
  });

  test('stock factions keep the framing they had', () => {
    expect(supplyReserveReach(1)).toEqual(supplyReserveReach());
    expect(supplyReserveReach(3)).toEqual(supplyReserveReach());
    expect(supplyReserveReach(4).halfWidth).toBeGreaterThan(supplyReserveReach().halfWidth);
  });

  test('counts troop kinds per faction by reserve stack, wherever the troops are', () => {
    const piece = (stackKey: string) => ({ stackKey }) as TablePiece;
    expect(widestTroopSupply([])).toBe(0);
    expect(
      widestTroopSupply([
        piece('troops:fremen:0'),
        piece('troops:fremen:0'),
        piece('troops:fremen:1'),
        piece('troops:custom:a'),
        piece('troops:custom:b'),
        piece('troops:custom:c'),
        piece('troops:custom:d'),
        piece('faction-token:custom'),
        piece('cards:treachery'),
      ])
    ).toBe(4);
  });
});
