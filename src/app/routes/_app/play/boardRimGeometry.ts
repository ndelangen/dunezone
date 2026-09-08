import { Shape } from 'three';

import { BOARD_RIM_RADIUS } from './tableGeometry';
import { PLAYER_RING_RADIUS, PLAYER_STATION_RADIUS, tableSeatAngles } from './tableSettings';
import type { TableSeatCount } from './tableSettings';

export const BOARD_RIM_DEPTH = 0.18;

function clampCosine(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

export function createBoardRimShape(seatCount: TableSeatCount): Shape {
  const rimRadius = BOARD_RIM_RADIUS;
  const stationDistance = PLAYER_RING_RADIUS;
  const stationRadius = PLAYER_STATION_RADIUS;
  const minimumIntersectionDistance = Math.abs(rimRadius - stationRadius);
  const maximumIntersectionDistance = rimRadius + stationRadius;

  if (stationDistance <= minimumIntersectionDistance || stationDistance >= maximumIntersectionDistance) {
    throw new Error('Player station collars must overlap the board rim.');
  }

  const rimJoinHalfAngle = Math.acos(
    clampCosine((stationDistance ** 2 + rimRadius ** 2 - stationRadius ** 2) / (2 * stationDistance * rimRadius))
  );
  const stationOuterHalfAngle = Math.acos(
    clampCosine((rimRadius ** 2 - stationDistance ** 2 - stationRadius ** 2) / (2 * stationDistance * stationRadius))
  );
  const angles = tableSeatAngles(seatCount)
    .map(normalizeAngle)
    .sort((left, right) => left - right);
  const shape = new Shape();
  const firstEntryAngle = angles[0] - rimJoinHalfAngle;

  shape.moveTo(Math.cos(firstEntryAngle) * rimRadius, Math.sin(firstEntryAngle) * rimRadius);

  angles.forEach((angle, index) => {
    const stationX = Math.cos(angle) * stationDistance;
    const stationY = Math.sin(angle) * stationDistance;
    shape.absarc(
      stationX,
      stationY,
      stationRadius,
      angle - stationOuterHalfAngle,
      angle + stationOuterHalfAngle,
      false
    );

    const nextAngle = index === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[index + 1];
    shape.absarc(0, 0, rimRadius, angle + rimJoinHalfAngle, nextAngle - rimJoinHalfAngle, false);
  });

  shape.closePath();
  return shape;
}
