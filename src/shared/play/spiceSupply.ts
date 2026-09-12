import type { TablePiece, Vector3Tuple } from './model';
import { TABLE_PHASES } from './phases';
import { GameRejection } from './rejection';
import { SPICE_FOOTPRINT_RADIUS } from './spice';
import { restingPositionAt } from './tableGeometry';
import { trackerArcSlots } from './tableTrackers';
export { isSpicePiece } from './spice';

export function spiceSupplySlot() {
  return trackerArcSlots(TABLE_PHASES.length)[0];
}

export function isSpiceSupplyPosition(position: Vector3Tuple): boolean {
  const slot = spiceSupplySlot();
  return Math.hypot(position[0] - slot.position[0], position[2] - slot.position[2]) <= slot.radius;
}

export function createSpiceStack(eventNumber: number, count: number): TablePiece {
  if (!Number.isInteger(count)) {
    throw new GameRejection('Spawn between 1 and 10 spice at a time.');
  }
  if (count < 1 || count > 10) {
    throw new GameRejection('Spawn between 1 and 10 spice at a time.');
  }
  const slot = spiceSupplySlot();
  const radius = slot.arcRadius - slot.radius - SPICE_FOOTPRINT_RADIUS - 0.12;
  const piece: TablePiece = {
    id: `spice-${eventNumber}`,
    label: 'Spice',
    owner: 'shared',
    color: '#c48b39',
    accent: '#f4cf82',
    items: Array.from({ length: count }, (_, index) => ({ id: `spice-${eventNumber}-${index + 1}`, faceUp: true })),
    stackKey: 'spice',
    position: [Math.cos(slot.angle) * radius, 0, Math.sin(slot.angle) * radius],
    orientation: 0,
    flipRevision: 0,
    zoneId: null,
    locked: false,
    kind: 'marker',
  };
  return { ...piece, position: restingPositionAt(piece.position, piece) };
}
