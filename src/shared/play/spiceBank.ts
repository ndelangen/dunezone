import type { TablePiece, Vector3Tuple } from './model';
import { TABLE_PHASES } from './phases';
import { GameRejection } from './rejection';
import { planarDistance, restingPositionAt } from './tableGeometry';
import { trackerArcSlots } from './tableTrackers';

export function spiceBankSlot() {
  return trackerArcSlots(TABLE_PHASES.length)[0];
}

export function isSpiceBankPosition(position: Vector3Tuple): boolean {
  const slot = spiceBankSlot();
  return planarDistance(position, slot.position) <= slot.radius;
}

/* How far inside the bank's arc new spice appears; fixed, so spice already lying on the spawn point still takes new spice whatever a token's size. */
const SPAWN_CLEARANCE = 0.295;

export function createSpiceStack(eventNumber: number, count: number): TablePiece {
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new GameRejection('Spawn between 1 and 10 spice at a time.');
  }
  const slot = spiceBankSlot();
  const radius = slot.arcRadius - slot.radius - SPAWN_CLEARANCE;
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
