import type { Vector3Tuple } from './model';
import { PLAYER_RING_RADIUS } from './tableSettings';

/* Troop reserves stand right behind the faction token, on the side away from the board. */
const RESERVE_RADIUS = PLAYER_RING_RADIUS + 0.62;

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
    reserves: Array.from({ length: troopKinds }, (_, index) =>
      along(RESERVE_RADIUS, (index - (troopKinds - 1) / 2) * 0.4)
    ),
    traitors: {
      position: along(3.15),
      orientation: Math.PI / 2 - angle,
    },
  };
}
