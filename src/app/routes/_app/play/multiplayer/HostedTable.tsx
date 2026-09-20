import { Anchor, Button, Group, Image, List, NumberInput, Select, Stack, Text } from '@mantine/core';
import { emptyPublicControls } from '@shared/play/inventory';
import type { SpawnSelection } from '@shared/play/inventory';
import { phaseAt, tableProgressFor } from '@shared/play/phases';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';
import { setupMapVisible, setupReadyRequired, setupStep } from '@shared/play/setup';
import { Link } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { InlineFormattedTextSource } from '@ui/content/FormattedText';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import { useContext, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { requestPlayTicket } from '@db/play';

import { darkSchemeIslandAttributes } from '../DarkSchemeIsland';
import { GameTable } from '../GameTable';
import { usePointerSession } from '../PointerSessionContext';
import { DEFAULT_TABLE_SEAT_COUNT } from '../tableSettings';
import { TabletopContext, useTableKeyboard } from '../TabletopContext';
import type { TabletopContextValue } from '../TabletopContext';
import { TableWait } from '../TableWait';
import { BattleControls, BattleScene, HandControls } from './BattleControls';
import { OfflineConversations } from './Conversation';
import { DraftingHeader, DraftingOverlay, DraftingPanel } from './Drafting';
import { GameRuntimeContext } from './gameRuntime';
import { PresenceContext } from './PresenceContext';
import { PlayerPanel, RemovalDecisionBar, RemovalAudit } from './RemovalVotes';
import { GameMenu, SeatRequests } from './SeatRequests';
import { SwappingPanel } from './Swapping';
import { SwapScene } from './SwapScene';
import { TableSession } from './TableSession';
import type { TableProjection } from './TableSession';
import '../dune-play.css';

const SETUP_TOPICS = { traitors: 'leaders', forces: 'troops', prediction: 'fate' } as const satisfies Record<
  string,
  TopicIconTopic
>;

function useTableCommands(client: TableSession, table: TableProjection) {
  const value = useMemo<TabletopContextValue>(
    () => ({
      bankControls:
        table.canInteract && table.snapshot.bank
          ? {
              canCollect: (pieceId) => !table.reservedPieceIds.has(pieceId),
              collect: (pieceId) => client.command({ kind: 'bank-collect', pieceId }),
            }
          : undefined,
      deckControls: table.canInteract
        ? {
            recipients: table.snapshot.roster?.seats.flatMap((seat) => (seat.faction ? [seat.faction] : [])) ?? [],
            draw: (pieceId, recipient) => client.command({ kind: 'deck-draw', pieceId, recipient }),
            shuffle: (pieceId) => client.command({ kind: 'deck-shuffle', pieceId }),
          }
        : undefined,
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
  return value;
}

type ConnectionControlsProps = Readonly<{
  client: TableSession;
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
      helpOnly={Boolean(table.snapshot.stage)}
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
  const setup = table.snapshot.stage === 'setup' ? table.snapshot.setup : undefined;
  const step = setup && setupStep(setup);
  const needsReady = setup ? setupReadyRequired(setup) : phaseAt(table.snapshot.phase).id === 'mentat-pause';
  const full = !setup || table.snapshot.roster?.seats.every((seat) => controls.seats.includes(seat.id));
  const gated = needsReady ? !allReady || !full : step?.kind === 'prediction' && !table.snapshot.predictions?.[step.id];
  const ready = controls.ready.includes(table.viewer.viewerSeat);
  /* Readiness is a phase control, so it sits with Previous and Next in the header rather than on a
     tab; the count stays short so the toolbar keeps to one row at desktop widths. */
  return (
    <Group gap="xs" justify="flex-end" wrap="nowrap" role="group" aria-label="Phase navigation">
      {needsReady && (
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
        disabled={!table.canInteract || cooling || (setup ? setup.index === 0 : table.snapshot.phase === 0)}
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
      helpOnly={Boolean(table.snapshot.stage)}
      eyebrow={table.playback ? 'Playback phase' : 'Shared phase'}
      title={phase.label}
      description={
        table.snapshot.stage
          ? `${phase.instructions} Previous changes the tracker only. Pieces and storm position stay as they are.`
          : phase.instructions
      }
    >
      {!table.snapshot.stage && (
        <Text size="sm">Previous changes the tracker only. Pieces and storm position stay as they are.</Text>
      )}
    </Section>
  );
}

type SetupControlProps = Pick<ConnectionControlsProps, 'client' | 'table'>;

function PredictionCards({ table, factionId, turn }: { table: TableProjection; factionId: string; turn: number }) {
  const seat = table.snapshot.roster?.seats.find((entry) => entry.faction?.id === factionId);
  const token = seat && table.snapshot.swapping?.tokens[seat.id];
  return (
    <svg
      width="300"
      height="190"
      viewBox="0 0 300 190"
      role="img"
      aria-label={`${seat?.faction?.name ?? factionId}, turn ${turn}`}
    >
      <rect x="2" y="2" width="142" height="184" rx="10" fill="#dfcbaa" stroke="#66503a" strokeWidth="3" />
      <rect x="156" y="2" width="142" height="184" rx="10" fill="#dfcbaa" stroke="#66503a" strokeWidth="3" />
      {token && <image href={token} x="23" y="20" width="100" height="100" />}
      <text x="73" y="153" textAnchor="middle" fill="#302219" fontSize="13">
        {seat?.faction?.name ?? factionId}
      </text>
      <text x="227" y="62" textAnchor="middle" fill="#302219" fontSize="20">
        TURN
      </text>
      <text x="227" y="135" textAnchor="middle" fill="#302219" fontSize="68">
        {turn}
      </text>
    </svg>
  );
}

function PredictionInput({ client, table, stepId }: SetupControlProps & { stepId: string }) {
  const [choice, change] = useReducer(
    (
      state: { factionId: string | null; turn: string | number },
      patch: Partial<{ factionId: string | null; turn: string | number }>
    ) => ({ ...state, ...patch }),
    { factionId: null, turn: 1 }
  );
  const valid =
    choice.factionId && typeof choice.turn === 'number' && Number.isSafeInteger(choice.turn) && choice.turn >= 1;
  return (
    <Stack gap="sm">
      <Select
        label="Predicted winner"
        data={
          table.snapshot.roster?.seats.flatMap((seat) =>
            seat.faction ? [{ value: seat.faction.id, label: seat.faction.name }] : []
          ) ?? []
        }
        value={choice.factionId}
        onChange={(factionId) => change({ factionId })}
        disabled={!table.canInteract}
        attributes={{ dropdown: darkSchemeIslandAttributes }}
      />
      <NumberInput
        label="Predicted turn"
        min={1}
        allowDecimal={false}
        allowNegative={false}
        value={choice.turn}
        onChange={(turn) => change({ turn })}
        disabled={!table.canInteract}
      />
      <Button
        disabled={!table.canInteract || !valid}
        onClick={() =>
          valid &&
          client.command({
            kind: 'prediction-lock',
            stepId,
            choice: { factionId: choice.factionId!, turn: Number(choice.turn) },
          })
        }
      >
        Lock prediction
      </Button>
    </Stack>
  );
}

function Predictions({ client, table }: SetupControlProps) {
  const ownFaction = rosterSeat(table.snapshot.roster, table.viewer.viewerSeat)?.faction?.id;
  const current = table.snapshot.setup && setupStep(table.snapshot.setup);
  return table.snapshot.setup?.steps
    .filter((step) => step.kind === 'prediction')
    .map((step) => {
      const prediction = table.snapshot.predictions?.[step.id];
      const own = step.factionId === ownFaction;
      return (
        <Section
          helpOnly={Boolean(table.snapshot.stage)}
          key={step.id}
          title={step.title}
          description={`${step.instructions} ${step.kind === 'prediction' ? 'Locking is final. Only your faction can see the choice until you reveal it.' : ''} Previous changes the setup phase only. Completed actions and pieces stay as they are.`}
        >
          <Stack gap="sm">
            {prediction ? (
              <>
                <Text size="sm">{prediction.revealedAt === null ? 'Prediction locked' : 'Prediction revealed'}</Text>
                {prediction.choice && (
                  <PredictionCards
                    table={table}
                    factionId={prediction.choice.factionId}
                    turn={prediction.choice.turn}
                  />
                )}
                {own && prediction.revealedAt === null && (
                  <Button
                    variant="default"
                    disabled={!table.canInteract}
                    onClick={() => client.command({ kind: 'prediction-reveal', stepId: step.id })}
                  >
                    Reveal prediction
                  </Button>
                )}
              </>
            ) : own && current?.id === step.id && table.snapshot.stage === 'setup' ? (
              <PredictionInput key={step.id} client={client} table={table} stepId={step.id} />
            ) : (
              <Text size="sm">Waiting for the faction player to lock a prediction.</Text>
            )}
          </Stack>
        </Section>
      );
    });
}

function SetupControls({ client, table }: SetupControlProps) {
  const setup = table.snapshot.setup;
  if (!setup) {
    return null;
  }
  const step = setupStep(setup);
  return (
    <Stack gap="md">
      {step.kind !== 'prediction' && (
        <Section
          helpOnly={Boolean(table.snapshot.stage)}
          title={step.title}
          description={`${step.instructions} Previous changes the setup phase only. Completed actions and pieces stay as they are.`}
        >
          <Stack gap="sm">
            {step.kind === 'traitors' && (
              <Button
                variant="default"
                disabled={!table.canInteract}
                onClick={() => client.command({ kind: 'traitors-gather' })}
              >
                Gather tabletop traitors
              </Button>
            )}
            {step.kind === 'forces' &&
              setup.instructions.map((entry) => (
                <Section
                  helpOnly={Boolean(table.snapshot.stage)}
                  key={entry.factionId}
                  title={
                    table.snapshot.roster?.seats.find((seat) => seat.faction?.id === entry.factionId)?.faction?.name ??
                    entry.factionId
                  }
                >
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    <InlineFormattedTextSource
                      source={entry.text || 'Follow your faction rules for starting forces.'}
                    />
                  </Text>
                </Section>
              ))}
          </Stack>
        </Section>
      )}
      <Predictions client={client} table={table} />
    </Stack>
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
  const pointerSession = usePointerSession();
  const [picker, dispatch] = useReducer(pickerReducer, { open: false, selection: null, requestId: null });
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const entries = view.catalogue?.entries ?? [];
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const contents = view.catalogue?.requestId === picker.requestId ? view.catalogue.contents : null;
  const pieces = table.snapshot.table.pieces.filter((piece) => piece.inventory === 'shared');
  return (
    <Section
      helpOnly={Boolean(table.snapshot.stage)}
      title="Shared inventory"
      description="Drag an item onto the table. It lands face down."
      action={
        table.snapshot.stage !== 'setup' && (
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
        )
      }
    >
      <Stack gap="md">
        {table.snapshot.setup && (
          <Button
            variant="default"
            disabled={!table.canInteract}
            onClick={() => client.command({ kind: 'traitors-gather' })}
          >
            Gather tabletop traitors
          </Button>
        )}
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
                  pointerSession.carry(event.nativeEvent, piece.id, event.shiftKey ? 'top' : 'whole');
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
  if (!bank) {
    return null;
  }
  const validAmount =
    typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0 && amount <= bank.balance;
  return (
    <Section
      helpOnly={Boolean(table.snapshot.stage)}
      title="Faction bank"
      description="Only you see this balance. Withdraw onto the table. Right-click a spice stack to take it into your bank. Drop a stack on the supply disc to dispose of it."
    >
      <Stack gap="xs">
        <Text component="output" aria-label="Banked spice" ff="C_Advokat_Modern, serif" size="64px" lh={1.1}>
          {bank.balance}
        </Text>
        <Group align="center" wrap="nowrap" gap="xs">
          <NumberInput
            aria-label="Spice to withdraw"
            w={80}
            style={{ flexShrink: 0 }}
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
        </Group>
      </Stack>
    </Section>
  );
}

function SpiceHistory({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const entries = view.spiceHistory?.entries ?? table.snapshot.spiceTransfers ?? [];
  const more = view.spiceHistory?.more ?? entries.length === 20;
  return (
    <Section helpOnly={Boolean(table.snapshot.stage)} title="Public spice transfers">
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
  client: TableSession;
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
  /* Giving up a seat starts in the game menu and is confirmed in the decision bar, so the two share one flag. */
  const [leaving, setLeaving] = useState(false);
  const [playerSelection, selectPlayer] = useReducer(
    (
      _: { seat: string | null; vote: string | null; tab: 'public' | 'conversation' },
      next: { seat: string | null; vote: string | null; tab: 'public' | 'conversation' }
    ) => next,
    { seat: null, vote: null, tab: 'conversation' }
  );
  const removalVotes = table.snapshot.removalVotes ?? [];
  const selectedPlayer =
    removalVotes.find((vote) => vote.id === playerSelection.vote)?.target.seat ?? playerSelection.seat;
  /* A real game before play shows its stage where a playing table shows its turn and phase. */
  const stage = table.snapshot.stage;
  const stageLabel = stage && stage !== 'play' ? stage.charAt(0).toUpperCase() + stage.slice(1) : undefined;
  return (
    <TabletopContext.Provider value={value}>
      <PresenceContext.Provider value={presence}>
        {/* A boxless wrapper carries the connection state the browser verification waits on, whichever tab is open. */}
        <div data-connection="authorized" data-revision={table.liveRevision} style={{ display: 'contents' }}>
          <GameTable
            phaseControlsOnly={Boolean(stage)}
            seatCount={table.snapshot.roster?.seatCount ?? DEFAULT_TABLE_SEAT_COUNT}
            tableProgress={progress}
            stageLabel={stageLabel}
            trading={stage === 'swapping'}
            setup={stage === 'setup'}
            mapVisible={setupMapVisible(table.snapshot.setup)}
            toolbarControl={
              !stageLabel || (stage === 'setup' && table.snapshot.setup) ? (
                <PhaseNavigation client={client} table={table} />
              ) : undefined
            }
            onSelectTurn={client.selectTurn}
            showStormControls={!stageLabel && progress.activePhaseId === 'storm'}
            sceneContent={
              stage === 'swapping' || stage === 'setup' ? (
                <>
                  <SwapScene snapshot={table.snapshot} />
                  {stage === 'setup' && <BattleScene client={client} table={table} />}
                </>
              ) : (
                <BattleScene client={client} table={table} />
              )
            }
            decisionBar={
              <Stack data-decision-bar gap="xs">
                <RemovalDecisionBar
                  votes={removalVotes}
                  onOpen={(vote) => selectPlayer({ seat: vote.target.seat, vote: vote.id, tab: 'public' })}
                />
                <SeatRequests
                  client={client}
                  table={table}
                  error={error}
                  leaving={leaving}
                  onStay={() => setLeaving(false)}
                />
              </Stack>
            }
            gameMenu={<GameMenu table={table} onLeave={() => setLeaving(true)} />}
            stageStatus={
              stage === 'drafting' ? (
                <DraftingHeader table={table} />
              ) : stage === 'setup' && table.snapshot.setup ? (
                <Text size="sm">{setupStep(table.snapshot.setup).title}</Text>
              ) : undefined
            }
            stageOverlay={stage === 'drafting' ? <DraftingOverlay client={client} table={table} /> : undefined}
            panelContent={
              stage === 'swapping' ? (
                <SwappingPanel client={client} table={table} />
              ) : stage === 'drafting' && table.viewer.viewerSeat !== SPECTATOR_SEAT ? (
                <DraftingPanel client={client} table={table} />
              ) : undefined
            }
            playerPanel={
              stage && stage !== 'discarded' ? (
                <PlayerPanel
                  client={client}
                  table={table}
                  error={error}
                  selected={selectedPlayer}
                  selectedTab={playerSelection.tab}
                  onSelect={(seat, tab) =>
                    selectPlayer({
                      seat,
                      vote: removalVotes.find((vote) => vote.target.seat === seat)?.id ?? null,
                      tab,
                    })
                  }
                />
              ) : undefined
            }
            panelTabs={[
              ...(stageLabel && stage !== 'setup'
                ? []
                : [
                    ...(table.snapshot.setup
                      ? [
                          {
                            key: 'setup',
                            label: stage === 'setup' ? 'Setup' : 'Predictions',
                            topic:
                              stage === 'setup'
                                ? SETUP_TOPICS[setupStep(table.snapshot.setup).kind]
                                : ('fate' as const),
                            content:
                              stage === 'setup' ? (
                                <SetupControls client={client} table={table} />
                              ) : (
                                <Predictions client={client} table={table} />
                              ),
                          },
                        ]
                      : []),
                    ...(table.snapshot.hand
                      ? [
                          {
                            key: 'hand',
                            label: 'Hand',
                            topic: 'hand' as const,
                            content: <HandControls client={client} table={table} hand={table.snapshot.hand} />,
                          },
                        ]
                      : []),
                    ...(!stage && !stageLabel && (table.snapshot.battle || progress.activePhaseId === 'battle')
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
                      topic: 'assets' as const,
                      content: <SharedInventory client={client} table={table} />,
                    },
                    {
                      key: 'spice',
                      label: 'Spice',
                      topic: 'spice' as const,
                      content: (
                        <>
                          <FactionBankControls client={client} table={table} />
                          <SpiceHistory client={client} table={table} />
                        </>
                      ),
                    },
                  ]),
              ...(stage
                ? [
                    {
                      key: 'log',
                      label: 'Log',
                      topic: 'log' as const,
                      content: null,
                      subtabs: [
                        {
                          key: 'audit',
                          label: 'Audit',
                          topic: 'audit' as const,
                          content: <RemovalAudit client={client} table={table} />,
                        },
                      ],
                    },
                  ]
                : []),
            ]}
            tableControls={
              stageLabel ? undefined : (
                <>
                  <PhaseControls table={table} />
                  {stage === 'play' && table.snapshot.setup && table.snapshot.phase === 0 && (
                    <Button
                      variant="default"
                      disabled={!table.canInteract}
                      onClick={() => client.command({ kind: 'storm-random' })}
                    >
                      Place storm randomly
                    </Button>
                  )}
                  {stage === 'play' ? (
                    <>
                      <PlaybackControls client={client} table={table} />
                      {error && <FormError title="From the table">{error}</FormError>}
                      {(table.snapshot.battle || progress.activePhaseId === 'battle') && (
                        <BattleControls client={client} table={table} />
                      )}
                    </>
                  ) : (
                    <ConnectionControls client={client} table={table} error={error} />
                  )}
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
  const runtime = useContext(GameRuntimeContext);
  const [client] = useState(() => new TableSession(gameId, requestPlayTicket, runtime));
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => client.connect(), [client]);
  if (!view.table) {
    return (
      <TableWait status={view.error ?? 'Connecting to the hosted table...'} connection={view.status}>
        {view.status === 'denied' && (
          <Anchor component={Link} to="/auth/login">
            Sign in again
          </Anchor>
        )}
        <OfflineConversations client={client} />
        {exitControl}
      </TableWait>
    );
  }
  return <ConnectedTable client={client} table={view.table} error={view.error} />;
}
