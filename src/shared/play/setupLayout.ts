import type { Vector3Tuple } from './model';
import { FACTION_TOKEN_SCALE, TROOP_FOOTPRINT_RADIUS } from './tableGeometry';
import { PLAYER_RING_RADIUS } from './tableSettings';

/* Troop reserves stand right behind the faction token, on the side away from the board, just clear of its footprint. */
const RESERVE_RADIUS = PLAYER_RING_RADIUS + TROOP_FOOTPRINT_RADIUS * (FACTION_TOKEN_SCALE + 1) + 0.01;

const RESERVE_SPACING = 0.4;

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
    // An arc at one radius keeps every kind's reserve within the playable table, however many kinds a faction has.
    reserves: Array.from({ length: troopKinds }, (_, index) =>
      polar(angle + ((index - (troopKinds - 1) / 2) * RESERVE_SPACING) / RESERVE_RADIUS, RESERVE_RADIUS)
    ),
    traitors: {
      position: along(3.15),
      orientation: Math.PI / 2 - angle,
    },
  };
}
