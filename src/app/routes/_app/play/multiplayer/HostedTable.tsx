import { Button, Group, Stack, Text, Select, Image } from '@mantine/core';
import { emptyPublicControls } from '@shared/play/inventory';
import type { SpawnSelection } from '@shared/play/inventory';
import { HOSTED_TABLE_SEAT_COUNT } from '@shared/play/model';
import { phaseAt, tableProgressFor } from '@shared/play/phases';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { requestPlayTicket } from '@db/play';

import styles from '../demo.module.css';
import { GameTable } from '../GameTable';
import { TabletopContext, useTableKeyboard } from '../TabletopContext';
import type { TabletopContextValue } from '../TabletopContext';
import { PresenceContext } from './PresenceContext';
import { TableConnection } from './TableConnection';
import type { TableProjection } from './TableConnection';
import '../dune-play.css';

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
      spawnSpice: client.spawnSpice,
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
    </section>
  );
}

function PhaseNavigation({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const cooling = table.phaseCooling;
  const allReady = controls.seats.length > 0 && controls.seats.every((seat) => controls.ready.includes(seat));
  const gated = phaseAt(table.snapshot.phase).id === 'mentat-pause' && !allReady;
  return (
    <Group gap="xs" wrap="nowrap" role="group" aria-label="Phase navigation">
      <Button
        variant="subtle"
        disabled={!table.canInteract || cooling || table.snapshot.phase === 0}
        onClick={() => client.command({ kind: 'phase', direction: -1 })}
      >
        Previous phase
      </Button>
      <Button disabled={!table.canInteract || cooling || gated} onClick={() => client.command({ kind: 'phase' })}>
        Next phase
      </Button>
    </Group>
  );
}

function PhaseControls({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const phase = phaseAt(table.snapshot.phase);
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const ready = controls.ready.includes(table.viewer.viewerSeat);
  return (
    <Section
      title={phase.label}
      eyebrow={table.playback ? 'Playback phase' : 'Shared phase'}
      description={phase.instructions}
    >
      <Stack gap="xs">
        <Text size="sm">Previous changes the tracker only. Pieces and storm position stay as they are.</Text>
        {phase.id === 'mentat-pause' && (
          <Group>
            <Button
              disabled={!table.canInteract}
              variant={ready ? 'subtle' : 'filled'}
              onClick={() => client.command({ kind: 'ready', ready: !ready })}
            >
              {ready ? 'Withdraw readiness' : 'Ready'}
            </Button>
            <Text role="status">
              {controls.ready.filter((seat) => controls.seats.includes(seat)).length} of {controls.seats.length} players
              ready
            </Text>
          </Group>
        )}
      </Stack>
    </Section>
  );
}

type PickerState = { open: boolean; selection: SpawnSelection | null; requestId: string | null };
type PickerEvent =
  | { type: 'open' | 'close' }
  | { type: 'select'; selection: SpawnSelection | null; requestId: string | null };
function pickerReducer(_state: PickerState, event: PickerEvent): PickerState {
  if (event.type === 'select') {
    return { open: true, selection: event.selection, requestId: event.requestId };
  }
  return { open: event.type === 'open', selection: null, requestId: null };
}

function SharedInventory({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const [picker, dispatch] = useReducer(pickerReducer, { open: false, selection: null, requestId: null });
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const entries = view.catalogue?.entries ?? [];
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const contents = view.catalogue?.requestId === picker.requestId ? view.catalogue.contents : null;
  const pieces = table.snapshot.table.pieces.filter((piece) => piece.inventory === 'shared');
  return (
    <Section
      title="Shared inventory"
      description="Drag an item onto the table. It lands face down."
      action={
        <Button
          variant="subtle"
          disabled={!table.canInteract}
          onClick={() => {
            if (!picker.open) {
              client.catalogue();
            }
            dispatch({ type: picker.open ? 'close' : 'open' });
          }}
        >
          {picker.open ? 'Close catalogue' : 'Add from catalogue'}
        </Button>
      }
    >
      <Stack gap="md">
        {picker.open && (
          <Group align="end">
            <Select
              label="Catalogue asset"
              searchable
              placeholder="Choose a deck, bundle or token"
              data={entries.map((entry) => ({ value: `${entry.type}/${entry.slug}`, label: entry.name }))}
              value={picker.selection ? `${picker.selection.type}/${picker.selection.slug}` : null}
              onChange={(value) => {
                const selection = entries.find((entry) => `${entry.type}/${entry.slug}` === value) ?? null;
                dispatch({ type: 'select', selection, requestId: selection ? client.catalogue(selection) : null });
              }}
            />
            <Button
              disabled={!table.canInteract || !contents || !picker.selection}
              onClick={() => {
                if (picker.selection) {
                  client.command({ kind: 'spawn-request', type: picker.selection.type, slug: picker.selection.slug });
                }
              }}
            >
              {controls.seats.length === 1 ? 'Spawn' : 'Request'}
            </Button>
            {picker.selection && (
              <Text size="sm">
                {contents
                  ? `${contents.pieces.reduce((count, piece) => count + piece.items.length, 0)} items ready to add`
                  : view.catalogue?.requestId === picker.requestId && view.catalogue.error
                    ? view.catalogue.error
                    : 'Checking published definitions and images...'}
              </Text>
            )}
          </Group>
        )}
        <Group align="start">
          {!pieces.length && <Text c="dimmed">The shared inventory is empty.</Text>}
          {pieces.map((piece) => (
            <Stack gap={4} key={piece.id} align="center">
              <Button
                variant="transparent"
                disabled={!table.canInteract || table.reservedPieceIds.has(piece.id)}
                aria-label={`Drag ${piece.label} onto the table`}
                style={{ height: 100, padding: 0, touchAction: 'none' }}
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  client.beginGesture(piece.id, event.shiftKey ? 'top' : 'whole');
                }}
              >
                <Image src={piece.items.at(-1)?.artwork?.front} alt={piece.label} h={96} w={72} fit="contain" />
              </Button>
              <Text size="sm">
                {piece.label} × {piece.items.length}
              </Text>
            </Stack>
          ))}
        </Group>
        {controls.requests.map((request) => (
          <Group key={request.id} justify="space-between">
            <Text>
              {request.contents.name} requested by {request.requesterName}
            </Text>
            <Group gap="xs">
              <Button
                disabled={
                  !table.canInteract || (request.requester === table.viewer.userId && controls.seats.length > 1)
                }
                onClick={() => client.command({ kind: 'spawn-approve', requestId: request.id })}
              >
                Approve
              </Button>
              <Button
                variant="subtle"
                disabled={!table.canInteract}
                onClick={() => client.command({ kind: 'spawn-dismiss', requestId: request.id })}
              >
                Dismiss
              </Button>
            </Group>
          </Group>
        ))}
      </Stack>
    </Section>
  );
}

function ConnectedTable({
  client,
  table,
  error,
}: Readonly<{
  client: TableConnection;
  table: TableProjection;
  error: string | null;
}>) {
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
  const progress = tableProgressFor(table.snapshot.phase);
  return (
    <TabletopContext.Provider value={value}>
      <PresenceContext.Provider value={presence}>
        <GameTable
          seatCount={HOSTED_TABLE_SEAT_COUNT}
          tableProgress={progress}
          toolbarControl={<PhaseNavigation client={client} table={table} />}
          onSelectTurn={client.selectTurn}
          showStormControls={progress.activePhaseId === 'storm'}
          sessionControl={
            <>
              <PhaseControls client={client} table={table} />
              <SharedInventory client={client} table={table} />
              <ConnectionControls client={client} table={table} error={error} />
            </>
          }
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
  return <ConnectedTable client={client} table={view.table} error={view.error} />;
}
