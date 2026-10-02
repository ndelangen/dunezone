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
  | 'bankControls'
  | 'canInteract'
  | 'deckControls'
  | 'flippingPieceIds'
  | 'gestureActivePieceId'
  | 'hoveredPieceId'
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

/** The session's commands and its pointer feed, which stay the same for the session's life, for parts that must not follow every update. */
export type TabletopActions = Pick<
  TableSession,
  'finishPieceFlip' | 'getPointers' | 'selectPiece' | 'setHoveredPiece' | 'subscribePointers'
>;

const TabletopActionsContext = createContext<TabletopActions | null>(null);

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
  const actions = useMemo<TabletopActions>(
    () => ({
      finishPieceFlip: session.finishPieceFlip,
      getPointers: session.getPointers,
      selectPiece: session.selectPiece,
      setHoveredPiece: session.setHoveredPiece,
      subscribePointers: session.subscribePointers,
    }),
    [session]
  );
  return (
    <TabletopActionsContext value={actions}>
      <TabletopContext value={value}>{children}</TabletopContext>
    </TabletopActionsContext>
  );
}

export function useTabletop(): TabletopContextValue {
  const value = useContext(TabletopContext);
  if (!value) {
    throw new Error('useTabletop must be used inside TabletopSessionProvider');
  }
  return value;
}

export function useTabletopActions(): TabletopActions {
  const value = useContext(TabletopActionsContext);
  if (!value) {
    throw new Error('useTabletopActions must be used inside TabletopSessionProvider');
  }
  return value;
}
