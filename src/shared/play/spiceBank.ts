import type { TableLayout } from './boardLayout';
import type { TablePiece, Vector3Tuple } from './model';
import { TABLE_PHASES } from './phases';
import { GameRejection } from './rejection';
import { SPICE_FOOTPRINT_RADIUS } from './spice';
import { planarDistance, restingPositionAt } from './tableGeometry';
import { trackerArcCenter, trackerArcSlots } from './tableTrackers';

export function spiceBankSlot(layout: TableLayout = 'one-board') {
  return trackerArcSlots(TABLE_PHASES.length, layout)[0]!;
}

export function isSpiceBankPosition(position: Vector3Tuple, layout: TableLayout = 'one-board'): boolean {
  const slot = spiceBankSlot(layout);
  return planarDistance(position, slot.position) <= slot.radius;
}

export function createSpiceStack(eventNumber: number, count: number, layout: TableLayout = 'one-board'): TablePiece {
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new GameRejection('Spawn between 1 and 10 spice at a time.');
  }
  const slot = spiceBankSlot(layout);
  const [centerX, , centerZ] = trackerArcCenter(layout);
  const radius = slot.arcRadius - slot.radius - SPICE_FOOTPRINT_RADIUS - 0.12;
  const piece: TablePiece = {
    id: `spice-${eventNumber}`,
    label: 'Spice',
    owner: 'shared',
    color: '#c48b39',
    accent: '#f4cf82',
    items: Array.from({ length: count }, (_, index) => ({ id: `spice-${eventNumber}-${index + 1}`, faceUp: true })),
    stackKey: 'spice',
    position: [centerX + Math.cos(slot.angle) * radius, 0, centerZ + Math.sin(slot.angle) * radius],
    orientation: 0,
    flipRevision: 0,
    zoneId: null,
    locked: false,
    kind: 'marker',
  };
  return { ...piece, position: restingPositionAt(piece.position, piece, layout) };
}
