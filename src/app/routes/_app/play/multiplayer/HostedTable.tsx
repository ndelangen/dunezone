import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { requestPlayTicket } from '@db/play';

import styles from '../demo.module.css';
import { GameTable } from '../GameTable';
import type { TableSeatCount } from '../tableSettings';
import { TabletopContext, useTableKeyboard } from '../TabletopContext';
import type { TabletopContextValue } from '../TabletopContext';
import type { TableProgress } from '../tableTrackers';
import { PresenceContext } from './PresenceContext';
import { TableConnection } from './TableConnection';
import type { TableProjection } from './TableConnection';
import '../dune-play.css';

const phases = [
  { id: 'storm', label: 'Storm' },
  { id: 'spice-blow', label: 'Spice blow' },
  { id: 'choam-charity', label: 'CHOAM charity' },
  { id: 'bidding', label: 'Bidding' },
  { id: 'revival', label: 'Revival' },
  { id: 'shipment-and-movement', label: 'Shipment and movement' },
  { id: 'battle', label: 'Battle' },
  { id: 'spice-collection', label: 'Spice collection' },
  { id: 'mentat-pause', label: 'Mentat pause' },
];

function useTableCommands(client: TableConnection, table: TableProjection) {
  const value = useMemo<TabletopContextValue>(
    () => ({
      state: table.state,
      selectedPiece: table.renderedPieces.find((piece) => piece.id === table.state.selectedPieceId) ?? null,
      renderedPieces: table.renderedPieces,
      hoveredPieceId: table.hoveredPieceId,
      gestureActivePieceId: table.gestureActivePieceId,
      flippingPieceIds: table.flippingPieceIds,
      affordances: client.affordances(),
      renderedPositionFor: client.renderedPositionFor,
      renderedOrientationFor: client.renderedOrientationFor,
      selectPiece: client.selectPiece,
      setHoveredPiece: client.setHoveredPiece,
      beginGesture: client.beginGesture,
      updateGesture: client.updateGesture,
      finishGesture: client.finishGesture,
      stageSelectedToZone: client.stageSelectedToZone,
      commitDraft: client.commitDraft,
      cancelDraft: client.cancelDraft,
      splitSelected: client.splitSelected,
      stackSelected: client.stackSelected,
      takeAdditionalFromTarget: client.takeAdditionalFromTarget,
      rotateSelected: client.rotateSelected,
      flipSelected: client.flipSelected,
      finishPieceFlip: client.finishPieceFlip,
      toggleLockSelected: client.toggleLockSelected,
      moveStormBy: client.moveStormBy,
      setEnforcement: client.setEnforcement,
      reset: client.reset,
    }),
    [client, table]
  );
  useTableKeyboard(value);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        client.cancelDraft();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [client]);
  return value;
}

type ConnectionControlsProps = Readonly<{
  client: TableConnection;
  table: TableProjection;
  error: string | null;
}>;

function PlaybackControls({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const { playback, historyPending } = table;
  return (
    <>
      {playback && (
        <p>
          <output>
            Playback checkpoint {playback.step} of {playback.lastStep}. Table actions are paused.
          </output>
        </p>
      )}
      {historyPending && (
        <p>
          <output>Loading playback...</output>
        </p>
      )}
      <fieldset
        className="storm-debug-control__actions"
        aria-label="Phase playback"
        style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
      >
        {playback ? (
          <>
            <button
              className="button button--quiet"
              disabled={historyPending || playback.step === 0}
              onClick={() => client.requestHistory(playback.step - 1)}
            >
              Earlier phase
            </button>
            <button
              className="button button--quiet"
              disabled={historyPending || playback.step === playback.lastStep}
              onClick={() => client.requestHistory(playback.step + 1)}
            >
              Later phase
            </button>
          </>
        ) : (
          <button
            className="button button--quiet"
            disabled={historyPending || !!table.state.draftMove}
            onClick={() => client.requestHistory(0)}
          >
            Replay from start
          </button>
        )}
        {(playback || historyPending) && (
          <button className="button button--quiet" onClick={client.resumeLive}>
            Return to live
          </button>
        )}
      </fieldset>
    </>
  );
}

function ConnectionControls({ client, table, error }: ConnectionControlsProps) {
  return (
    <section
      className="selected-piece-control"
      aria-label="Hosted connection"
      data-connection="authorized"
      data-revision={table.liveRevision}
    >
      <div className="selected-piece-control__copy">
        <span className="eyebrow">Hosted fixture</span>
        <p>
          {table.viewer.displayName} · {table.viewer.viewerSeat === 'neutral' ? 'Observer' : table.viewer.viewerSeat} ·
          Saved revision {table.liveRevision}
        </p>
        {error && (
          <p>
            <output>{error}</output>
          </p>
        )}
        <PlaybackControls client={client} table={table} />
      </div>
      <button
        className="button button--quiet"
        disabled={!table.canInteract || !!table.state.draftMove}
        onClick={() => client.command({ kind: 'phase' })}
      >
        Next phase
      </button>
    </section>
  );
}

function ConnectedTable({
  client,
  table,
  exitControl,
  error,
}: Readonly<{
  client: TableConnection;
  table: TableProjection;
  exitControl: ReactNode;
  error: string | null;
}>) {
  const [seatCount, setSeatCount] = useState<TableSeatCount>(6);
  const value = useTableCommands(client, table);
  const canInteract = table.canInteract;
  const presence = useMemo(
    () => ({
      pointers: table.pointers,
      remoteCarriedIds: table.remoteCarriedIds,
      reservedPieceIds: table.reservedPieceIds,
      canInteract,
      publishPointer: client.publishPointer,
    }),
    [canInteract, client, table]
  );
  const progress: TableProgress = {
    turn: Math.floor(table.snapshot.phase / phases.length) + 1,
    phases,
    activePhaseId: phases[table.snapshot.phase % phases.length]?.id ?? 'storm',
  };
  return (
    <TabletopContext.Provider value={value}>
      <PresenceContext.Provider value={presence}>
        <GameTable
          seatCount={seatCount}
          onSeatCountChange={setSeatCount}
          exitControl={exitControl}
          tableProgress={progress}
          sessionControl={<ConnectionControls client={client} table={table} error={error} />}
        />
      </PresenceContext.Provider>
    </TabletopContext.Provider>
  );
}

export default function HostedTable({ gameId, exitControl }: Readonly<{ gameId: string; exitControl: ReactNode }>) {
  const [client] = useState(() => new TableConnection(gameId, requestPlayTicket));
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => client.connect(), [client]);
  if (!view.table) {
    return (
      <div className={styles.loading} data-connection={view.status}>
        <p>
          <output>{view.error ?? 'Connecting to the hosted table...'}</output>
        </p>
        {view.status === 'denied' && <Link to="/auth/login">Sign in again</Link>}
        {exitControl}
      </div>
    );
  }
  return <ConnectedTable client={client} table={view.table} exitControl={exitControl} error={view.error} />;
}
