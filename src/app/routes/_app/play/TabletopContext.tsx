import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
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
  | 'peek'
  | 'peekControls'
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

type TabletopCommands = Omit<TabletopContextValue, keyof TableProjection>;

/** The session's commands and its pointer feed, which stay the same for the session's life, for parts that must not follow every update. */
export type TabletopActions = Pick<
  TableSession,
  'finishPieceFlip' | 'getPointers' | 'selectPiece' | 'setHoveredPiece' | 'subscribePointers'
>;

type TabletopStore = {
  session: TableSession;
  commands: TabletopCommands;
  actions: TabletopActions;
};

const TabletopContext = createContext<TabletopStore | null>(null);

/*
 * Hands the scene and the table controls the session itself, which stays the same for the table's life.
 * Each part reads the live table from it, so a held piece moving renders the parts that show it, and not the canvas or the panels around them.
 */
export function TabletopSessionProvider({
  session,
  children,
}: Readonly<{ session: TableSession; children: ReactNode }>) {
  const store = useMemo<TabletopStore>(
    () => ({
      session,
      commands: {
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
      },
      actions: {
        finishPieceFlip: session.finishPieceFlip,
        getPointers: session.getPointers,
        selectPiece: session.selectPiece,
        setHoveredPiece: session.setHoveredPiece,
        subscribePointers: session.subscribePointers,
      },
    }),
    [session]
  );
  return <TabletopContext value={store}>{children}</TabletopContext>;
}

function useTabletopStore(): TabletopStore {
  const value = useContext(TabletopContext);
  if (!value) {
    throw new Error('useTabletop must be used inside TabletopSessionProvider');
  }
  return value;
}

function liveTable(session: TableSession): TableProjection {
  const table = session.getTable();
  if (!table) {
    throw new Error('The tabletop has no table to show.');
  }
  return table;
}

/** The live table with the commands the scene calls; the caller renders again on every update, held pieces moving included. */
export function useTabletop(): TabletopContextValue {
  const { session, commands } = useTabletopStore();
  const table = useSyncExternalStore(session.subscribeTable, () => liveTable(session));
  return useMemo(() => ({ ...table, ...commands }), [table, commands]);
}

/** One value read from the live table; the caller renders again only when that value changes, so a primitive follows only its own changes and a member the table rebuilds follows every update. */
export function useTabletopSelector<T>(select: (table: TableProjection) => T): T {
  const { session } = useTabletopStore();
  return useSyncExternalStore(session.subscribeTable, () => select(liveTable(session)));
}

/** Reads the live table with its commands when called, for handlers and bindings that must not render on every update. */
export function useTabletopReader(): () => TabletopContextValue {
  const { session, commands } = useTabletopStore();
  return useCallback(() => ({ ...liveTable(session), ...commands }), [session, commands]);
}

/** The session's commands, which stay the same for the table's life. */
export function useTabletopCommands(): TabletopCommands {
  return useTabletopStore().commands;
}

export function useTabletopActions(): TabletopActions {
  return useTabletopStore().actions;
}
