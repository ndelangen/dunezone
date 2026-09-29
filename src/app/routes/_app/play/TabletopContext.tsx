import type { affordancesFor, TablePiece, TableState, Vector3Tuple } from '@shared/play/model';
import { createContext, useContext } from 'react';

export type TabletopContextValue = {
  state: TableState;
  selectedPiece: TablePiece | null;
  renderedPieces: TablePiece[];
  hoveredPieceId: string | null;
  gestureActivePieceId: string | null;
  flippingPieceIds: ReadonlyMap<string, number>;
  finishPieceFlip(pieceId: string, revision: number): void;
  affordances: ReturnType<typeof affordancesFor>;
  renderedPositionFor(piece: TablePiece): Vector3Tuple;
  renderedOrientationFor(piece: TablePiece): number;
  selectPiece(pieceId: string | null): void;
  setHoveredPiece(pieceId: string | null): void;
  beginGesture(pieceId: string, pickup: 'top' | 'whole'): void;
  updateGesture(position: Vector3Tuple): void;
  finishGesture(position: Vector3Tuple): void;
  cancelDraft(): void;
  splitSelected(count?: number, pieceId?: string): void;
  stackSelected(pieceId?: string): void;
  takeAdditionalFromTarget(): void;
  rotateSelected(direction?: -1 | 1, pieceId?: string): void;
  flipSelected(pieceId?: string): void;
  toggleLockSelected(pieceId?: string): void;
  moveStormBy(direction?: -1 | 1): void;
  spawnSpice(count: number): void;
  bankControls?: {
    canCollect(pieceId: string): boolean;
    collect(pieceId: string): void;
  };
  deckControls?: {
    recipients: { id: string; name: string }[];
    draw(pieceId: string, recipient?: string): void;
    shuffle(pieceId: string): void;
  };
};

export const TabletopContext = createContext<TabletopContextValue | null>(null);

export function useTabletop(): TabletopContextValue {
  const value = useContext(TabletopContext);
  if (!value) {
    throw new Error('Table controls need a table.');
  }
  return value;
}
