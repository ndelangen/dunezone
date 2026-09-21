import type { Vector3Tuple } from './model';

/** Supply faces its seat, with troop reserves on the board side of the faction token. */
export function factionSupplyLayout(angle: number, troopKinds: number) {
  return {
    reserves: Array.from({ length: troopKinds }, (_, index): Vector3Tuple => {
      const offset = (index - (troopKinds - 1) / 2) * 0.4;
      return [Math.cos(angle) * 4 - Math.sin(angle) * offset, 0, Math.sin(angle) * 4 + Math.cos(angle) * offset];
    }),
    traitors: {
      position: [Math.cos(angle) * 3.15, 0, Math.sin(angle) * 3.15] as Vector3Tuple,
      orientation: Math.PI / 2 - angle,
    },
  };
}
