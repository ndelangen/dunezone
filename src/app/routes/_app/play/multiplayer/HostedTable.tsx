import { Anchor, Button, Group, Image, List, NumberInput, Select, Stack, Text } from '@mantine/core';
import { emptyPublicControls } from '@shared/play/inventory';
import type { SpawnSelection } from '@shared/play/inventory';
import { phaseAt, tableProgressFor } from '@shared/play/phases';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';
import { isSpicePiece } from '@shared/play/spice';
import { Link } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { requestPlayTicket } from '@db/play';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from '../DarkSchemeIsland';
import styles from '../demo.module.css';
import { GameTable } from '../GameTable';
import { DEFAULT_TABLE_SEAT_COUNT } from '../tableSettings';
import { TabletopContext, useTableKeyboard } from '../TabletopContext';
import type { TabletopContextValue } from '../TabletopContext';
import { BattleControls, BattleScene } from './BattleControls';
import { PresenceContext } from './PresenceContext';
import { SeatRail } from './SeatRail';
import { SeatRequests } from './SeatRequests';
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
        <Text component="output" size="sm">
          Playback checkpoint {playback.step} of {playback.lastStep}. Table actions are paused.
        </Text>
      )}
      {historyPending && (
        <Text component="output" size="sm">
          Loading playback...
        </Text>
      )}
      <Group gap="sm" role="group" aria-label="Phase playback">
        {playback ? (
          <>
            <Button
              variant="default"
              disabled={historyPending || playback.step === 0}
              onClick={() => client.requestHistory(playback.step - 1)}
            >
              Earlier phase
            </Button>
            <Button
              variant="default"
              disabled={historyPending || playback.step === playback.lastStep}
              onClick={() => client.requestHistory(playback.step + 1)}
            >
              Later phase
            </Button>
          </>
        ) : (
          <Button
            variant="default"
            disabled={historyPending || !!table.state.draftMove}
            onClick={() => client.requestHistory(0)}
          >
            Replay from start
          </Button>
        )}
        {(playback || historyPending) && (
          <Button variant="default" onClick={client.resumeLive}>
            Return to live
          </Button>
        )}
      </Group>
    </>
  );
}

/* A seat reads by the faction it carries; a seat with no faction yet, or a spectator, by what it is. */
function seatLabel(table: TableProjection): string {
  const seat = table.viewer.viewerSeat;
  if (seat === SPECTATOR_SEAT) {
    return 'Spectator';
  }
  return rosterSeat(table.snapshot.roster, seat)?.faction?.name ?? seat;
}

function ConnectionControls({ client, table, error }: ConnectionControlsProps) {
  const seat = seatLabel(table);
  return (
    <Section
      eyebrow="Hosted fixture"
      title="Hosted connection"
      description={`${table.viewer.displayName} · ${seat} · Saved revision ${table.liveRevision}`}
    >
      <Stack gap="sm">
        {error && <FormError title="From the table">{error}</FormError>}
        <PlaybackControls client={client} table={table} />
      </Stack>
    </Section>
  );
}

function PhaseNavigation({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const cooling = table.phaseCooling;
  const allReady = controls.seats.length > 0 && controls.seats.every((seat) => controls.ready.includes(seat));
  const mentat = phaseAt(table.snapshot.phase).id === 'mentat-pause';
  const gated = mentat && !allReady;
  const ready = controls.ready.includes(table.viewer.viewerSeat);
  /* Readiness is a phase control, so it sits with Previous and Next in the header rather than on a
     tab; the count stays short so the toolbar keeps to one row at desktop widths. */
  return (
    <Group gap="xs" justify="flex-end" wrap="nowrap" role="group" aria-label="Phase navigation">
      {mentat && (
        <>
          <Button
            disabled={!table.canInteract}
            variant={ready ? 'default' : 'filled'}
            onClick={() => client.command({ kind: 'ready', ready: !ready })}
          >
            {ready ? 'Withdraw readiness' : 'Ready'}
          </Button>
          <Text role="status" size="xs" c="dimmed">
            {controls.ready.filter((seat) => controls.seats.includes(seat)).length} of {controls.seats.length} ready
          </Text>
        </>
      )}
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

function PhaseControls({ table }: Pick<ConnectionControlsProps, 'table'>) {
  const phase = phaseAt(table.snapshot.phase);
  return (
    <Section
      eyebrow={table.playback ? 'Playback phase' : 'Shared phase'}
      title={phase.label}
      description={phase.instructions}
    >
      <Text size="sm">Previous changes the tracker only. Pieces and storm position stay as they are.</Text>
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
          variant="default"
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
              attributes={{ dropdown: darkSchemeIslandAttributes }}
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
                <Image
                  src={piece.items.at(-1)?.artwork?.[piece.kind === 'card' ? 'back' : 'front']}
                  alt={piece.label}
                  h={96}
                  w={72}
                  fit="contain"
                />
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
                  !table.canInteract ||
                  request.requesterSeat === null ||
                  request.requesterSeat === table.viewer.viewerSeat
                }
                onClick={() => client.command({ kind: 'spawn-approve', requestId: request.id })}
              >
                Approve
              </Button>
              <Button
                variant="default"
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

function FactionBankControls({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const [amount, setAmount] = useState<string | number>(1);
  const bank = table.snapshot.bank;
  const selected = table.snapshot.table.pieces.find((piece) => piece.id === table.state.selectedPieceId);
  if (!bank) {
    return null;
  }
  const collectable = isSpicePiece(selected) && !selected.locked && !table.reservedPieceIds.has(selected.id);
  const validAmount =
    typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0 && amount <= bank.balance;
  return (
    <Section
      title="Faction bank"
      description="Only you see this balance. Withdraw onto the table or select a spice stack to take it into your bank."
    >
      <Stack gap="xs">
        <Text size="sm">
          <output aria-label="Banked spice">{bank.balance} banked spice</output> · {bank.factionId}
        </Text>
        <Group align="end">
          <NumberInput
            label="Spice to withdraw"
            value={amount}
            onChange={setAmount}
            min={1}
            allowDecimal={false}
            allowNegative={false}
            disabled={!table.canInteract}
          />
          <Button
            disabled={!table.canInteract || !validAmount}
            onClick={() => client.command({ kind: 'bank-withdraw', amount: Number(amount) })}
          >
            Withdraw spice
          </Button>
          <Button
            variant="default"
            disabled={!table.canInteract || !collectable}
            onClick={() => selected && client.command({ kind: 'bank-collect', pieceId: selected.id })}
          >
            Take into bank
          </Button>
        </Group>
        <Text size="sm">
          Spice stays on the table until someone collects it. Drop a stack on the supply disc to dispose of it.
        </Text>
      </Stack>
    </Section>
  );
}

function SpiceHistory({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const entries = view.spiceHistory?.entries ?? table.snapshot.spiceTransfers ?? [];
  const more = view.spiceHistory?.more ?? entries.length === 20;
  return (
    <Section title="Public spice transfers">
      <Stack gap="xs">
        {entries.length === 0 && <Text size="sm">No spice transfers yet.</Text>}
        <List type="ordered" size="sm">
          {entries.map((entry) => (
            <List.Item key={entry.revision}>
              {entry.actor}: {entry.kind}, {entry.amount} spice from {entry.source}
              {entry.destination ? ` to ${entry.destination}` : ' removed from play'}.
            </List.Item>
          ))}
        </List>
        <Group>
          {more && (
            <Button variant="default" onClick={() => client.readSpiceHistory(entries.at(-1)!.revision)}>
              Earlier spice transfers
            </Button>
          )}
          {view.spiceHistory && (
            <Button variant="default" onClick={() => client.readSpiceHistory()}>
              Latest spice transfers
            </Button>
          )}
        </Group>
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
  /* A real game before play shows its stage where a playing table shows its turn and phase. */
  const stage = table.snapshot.stage;
  const stageLabel = stage && stage !== 'play' ? stage.charAt(0).toUpperCase() + stage.slice(1) : undefined;
  return (
    <TabletopContext.Provider value={value}>
      <PresenceContext.Provider value={presence}>
        {/* A boxless wrapper carries the connection state the browser verification waits on, whichever tab is open. */}
        <div data-connection="authorized" data-revision={table.liveRevision} style={{ display: 'contents' }}>
          <GameTable
            seatCount={table.snapshot.roster?.seatCount ?? DEFAULT_TABLE_SEAT_COUNT}
            tableProgress={progress}
            stageLabel={stageLabel}
            toolbarControl={stageLabel ? undefined : <PhaseNavigation client={client} table={table} />}
            onSelectTurn={client.selectTurn}
            showStormControls={progress.activePhaseId === 'storm'}
            sceneContent={<BattleScene client={client} table={table} />}
            decisionBar={<SeatRequests client={client} table={table} error={error} />}
            playersRail={table.snapshot.stage ? <SeatRail client={client} table={table} /> : undefined}
            panelTabs={
              stageLabel
                ? []
                : [
                    ...(table.snapshot.battle || progress.activePhaseId === 'battle'
                      ? [
                          {
                            key: 'battle',
                            label: 'Battle',
                            topic: 'battle' as const,
                            content: (
                              <>
                                {error && <FormError title="From the table">{error}</FormError>}
                                <BattleControls client={client} table={table} />
                              </>
                            ),
                          },
                        ]
                      : []),
                    {
                      key: 'shared',
                      label: 'Shared inventory',
                      topic: 'assets',
                      content: <SharedInventory client={client} table={table} />,
                    },
                    {
                      key: 'spice',
                      label: 'Spice',
                      topic: 'spice',
                      content: (
                        <>
                          <FactionBankControls client={client} table={table} />
                          <SpiceHistory client={client} table={table} />
                        </>
                      ),
                    },
                  ]
            }
            tableControls={
              stageLabel ? undefined : (
                <>
                  <PhaseControls table={table} />
                  <ConnectionControls client={client} table={table} error={error} />
                </>
              )
            }
          />
        </div>
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
      <DarkSchemeIsland>
        <div className={styles.loading} {...darkSchemeIslandAttributes} data-connection={view.status}>
          <Text component="output">{view.error ?? 'Connecting to the hosted table...'}</Text>
          {view.status === 'denied' && (
            <Anchor component={Link} to="/auth/login">
              Sign in again
            </Anchor>
          )}
          {exitControl}
        </div>
      </DarkSchemeIsland>
    );
  }
  return <ConnectedTable client={client} table={view.table} error={view.error} />;
}
