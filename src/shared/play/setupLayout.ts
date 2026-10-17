import type { TablePiece, Vector3Tuple } from './model';
import { FACTION_TOKEN_SCALE, TROOP_FOOTPRINT_RADIUS } from './tableGeometry';
import { PLAYER_RING_RADIUS } from './tableSettings';

/* Troop reserves stand right behind the faction token, on the side away from the board, just clear of its footprint. */
const RESERVE_RADIUS = PLAYER_RING_RADIUS + TROOP_FOOTPRINT_RADIUS * (FACTION_TOKEN_SCALE + 1) + 0.01;

const RESERVE_SPACING = 0.4;

/* The most troop kinds a stock faction has; tables with no more keep this framing. */
const STOCK_TROOP_KINDS = 3;

/**
 * How far a seat's troop reserves reach from its station, along the ring and away from the board, for framing the table around them.
 * A custom faction with more kinds spreads its reserves wider, so the reach grows with the most kinds any faction at the table has.
 */
export function supplyReserveReach(troopKinds = STOCK_TROOP_KINDS) {
  return {
    radius: RESERVE_RADIUS,
    halfWidth: ((Math.max(troopKinds, STOCK_TROOP_KINDS) - 1) / 2) * RESERVE_SPACING + TROOP_FOOTPRINT_RADIUS,
  };
}

/** The most troop kinds one faction has on the table, counted by the reserve stack each kind is dealt into, wherever its troops have gone since. */
export function widestTroopSupply(pieces: readonly TablePiece[]): number {
  const kinds = new Map<string, Set<string>>();
  for (const piece of pieces) {
    const [prefix, factionId] = piece.stackKey?.split(':') ?? [];
    if (prefix === 'troops' && factionId) {
      const faction = kinds.get(factionId) ?? new Set<string>();
      faction.add(piece.stackKey!);
      kinds.set(factionId, faction);
    }
  }
  return Math.max(0, ...[...kinds.values()].map((faction) => faction.size));
}

function polar(angle: number, radius: number): Vector3Tuple {
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

/** Supply faces its seat: the faction token on the seat's station, with troop reserves right behind it. */
export function factionSupplyLayout(angle: number, troopKinds: number) {
  const along = (radius: number, offset = 0): Vector3Tuple => [
    Math.cos(angle) * radius - Math.sin(angle) * offset,
    0,
    Math.sin(angle) * radius + Math.cos(angle) * offset,
  ];
  return {
    token: {
      position: along(PLAYER_RING_RADIUS),
      orientation: Math.PI / 2 - angle,
    },
    /* An arc at one radius keeps every kind's reserve within the playable table, however many kinds a faction has. */
    reserves: Array.from({ length: troopKinds }, (_, index) =>
      polar(angle + ((index - (troopKinds - 1) / 2) * RESERVE_SPACING) / RESERVE_RADIUS, RESERVE_RADIUS)
    ),
    traitors: {
      position: along(2.95),
      orientation: Math.PI / 2 - angle,
    },
  };
}
