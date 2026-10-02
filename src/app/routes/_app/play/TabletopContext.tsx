import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import type { TableProjection, TableSession } from './multiplayer/TableSession';

/**
 * What the scene and the table controls read: the session's commands over its latest projection.
 * The session owns every member's type, and this list names which of them the table hands out.
 */
export type TabletopContextValue = Pick<
  TableProjection,
  | 'affordances'
  | 'spiceReserveControls'
  | 'canHandleTable'
  | 'canInteract'
  | 'deckControls'
  | 'flippingPieceIds'
  | 'gestureActivePieceId'
  | 'hoveredPieceId'
  | 'pointers'
  | 'remoteCarriedIds'
  | 'renderedPieces'
  | 'reservedPieceIds'
  | 'selectedPiece'
  | 'state'
> &
  Pick<
    TableSession,
    | 'beginGesture'
    | 'cancelDraft'
    | 'finishGesture'
    | 'finishPieceFlip'
    | 'flipSelected'
    | 'moveStormBy'
    | 'publishPointer'
    | 'rotateSelected'
    | 'selectPiece'
    | 'setHoveredPiece'
    | 'spawnSpice'
    | 'splitSelected'
    | 'stackSelected'
    | 'takeAdditionalFromTarget'
    | 'toggleLockSelected'
    | 'updateGesture'
  >;

const TabletopContext = createContext<TabletopContextValue | null>(null);

/** Hands the scene and the table controls one value: a hosted session's latest projection with the commands they call. */
export function TabletopSessionProvider({
  session,
  table,
  children,
}: Readonly<{ session: TableSession; table: TableProjection; children: ReactNode }>) {
  const value = useMemo<TabletopContextValue>(
    () => ({
      ...table,
      beginGesture: session.beginGesture,
      cancelDraft: session.cancelDraft,
      finishGesture: session.finishGesture,
      finishPieceFlip: session.finishPieceFlip,
      flipSelected: session.flipSelected,
      moveStormBy: session.moveStormBy,
      publishPointer: session.publishPointer,
      rotateSelected: session.rotateSelected,
      selectPiece: session.selectPiece,
      setHoveredPiece: session.setHoveredPiece,
      spawnSpice: session.spawnSpice,
      splitSelected: session.splitSelected,
      stackSelected: session.stackSelected,
      takeAdditionalFromTarget: session.takeAdditionalFromTarget,
      toggleLockSelected: session.toggleLockSelected,
      updateGesture: session.updateGesture,
    }),
    [session, table]
  );
  return <TabletopContext value={value}>{children}</TabletopContext>;
}

export function useTabletop(): TabletopContextValue {
  const value = useContext(TabletopContext);
  if (!value) {
    throw new Error('useTabletop must be used inside TabletopSessionProvider');
  }
  return value;
}
