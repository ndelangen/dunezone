import { Anchor, Button, Group, List, Loader, NumberInput, Select, Stack, Text, Tooltip } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { emptyPublicControls } from '@shared/play/inventory';
import type { SpawnSelection } from '@shared/play/inventory';
import { lastTurnOf } from '@shared/play/lastTurn';
import { phaseAt, tableProgressFor } from '@shared/play/phases';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';
import { setupMapVisible, setupStep } from '@shared/play/setup';
import type { SpiceTransfer } from '@shared/play/spiceReserve';
import { DEFAULT_TABLE_SEAT_COUNT } from '@shared/play/tableSettings';
import { Link } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { InlineFormattedTextSource } from '@ui/content/FormattedText';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import { useContext, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { requestPlayTicket } from '@db/play';
import { GameSubscription } from '@app/routes/_app/play/multiplayer/GameSubscription';

import { TableSession } from '../../../../db/tabletop/TableSession';
import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { usePreloadedCardFaces } from '../../../../widgets/tabletop/cardFacePreload';
import { PieceArtwork } from '../../../../widgets/tabletop/PieceArtwork';
import { usePointerSession } from '../../../../widgets/tabletop/PointerSessionContext';
import { PredictionLogosContext } from '../../../../widgets/tabletop/prediction/predictionFace';
import { TabletopSessionProvider } from '../../../../widgets/tabletop/TabletopContext';
import { FoilConfetti } from '../FoilConfetti';
import { GameLink, InviteLink } from '../GameLink';
import { GameTable } from '../GameTable';
import { predictionCardInHand } from '../prediction/predictionCardInHand';
import { TableWait } from '../TableWait';
import { AllianceCoinsScene } from './AllianceCoins';
import { AlliancesPanel, AllianceStrip, showsAlliances } from './Alliances';
import { BattleControls, BattleScene, HandControls } from './BattleControls';
import { BidderScene } from './Bidder';
import { BidderToolbar } from './BidderToolbar';
import { OfflineConversations } from './Conversation';
import { DraftingHeader, DraftingOverlay, DraftingPanel, DraftingReady } from './Drafting';
import { ContinuePlaying, DetermineWinner, ResultControls, resultTitle } from './GameResult';
import { GameRuntimeContext } from './gameRuntime';
import { HandCountsScene } from './HandCounts';
import { HiddenZone } from './HiddenZone';
import { LogEntries } from './Log';
import {
  ALLIANCES_GUIDANCE,
  AUDIT_LOG_GUIDANCE,
  battleGuidance,
  GAME_LOG_GUIDANCE,
  handGuidance,
  HIDDEN_ZONE_GUIDANCE,
  LOG_GUIDANCE,
  phaseGuidance,
  phaseHelp,
  RESULT_GUIDANCE,
  setupGuidance,
  setupHelp,
  SHARED_INVENTORY_GUIDANCE,
  SHARED_INVENTORY_HELP,
  SPICE_GUIDANCE,
  SPICE_RESERVE_HELP,
} from './panelGuidance';
import { PhaseNavigation } from './PhaseNavigation';
import { PlayerPanel } from './RemovalVotes';
import { useResultCelebration } from './resultCelebration';
import { GameMenu, SeatPopover, StagePlayback } from './SeatRequests';
import { SwappingReady, SwappingStatus } from './Swapping';
import { SwapScene } from './SwapScene';
import { TableSettings } from './TableSettings';
import { ServerClockContext } from './useServerNow';
import '../dune-play.css';

const SETUP_TOPICS = {
  traitors: 'leaders',
  forces: 'troops',
  prediction: 'fate',
  instruction: 'setup',
} as const satisfies Record<string, TopicIconTopic>;

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
            disabled={historyPending || !!table.state.draftMove || table.reconnecting}
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
/** Where the game stands, with the last turn its wheel counts up to. */
function gameProgress(snapshot: TableProjection['snapshot']) {
  return { ...tableProgressFor(snapshot.phase, snapshot.phases), lastTurn: lastTurnOf(snapshot) };
}

function seatLabel(table: TableProjection): string {
  const seat = table.viewer.viewerSeat;
  if (seat === SPECTATOR_SEAT) {
    return 'Spectator';
  }
  const faction = rosterSeat(table.snapshot.roster, seat)?.faction;
  return (faction && snapshotFactionLabels(table.snapshot)[faction.id]) ?? seat;
}

function ConnectionControls({ client, table, error }: ConnectionControlsProps) {
  const seat = seatLabel(table);
  return (
    <Section
      hiddenHeading={Boolean(table.snapshot.stage)}
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

/* A spectator's dock opens on the battle when it loads during one, otherwise on the Log; later the spectator picks. */
const SPECTATOR_OPENING_TABS = ['battle', 'log'];

/* A battle the viewer's faction fights in opens the Battle tab once, when that faction takes its side. */
function battleFocus(table: TableProjection) {
  const battle = table.snapshot.battle;
  const own = rosterSeat(table.snapshot.roster, table.viewer.viewerSeat)?.faction?.id;
  /* The same "in play" test that shows the Battle tab: a hosted game in play, or a table with no stage. */
  const stage = table.snapshot.stage;
  if (
    (stage !== undefined && stage !== 'play') ||
    !battle ||
    !own ||
    !battle.sides.some((side) => side?.factionId === own)
  ) {
    return null;
  }
  return { key: 'battle', token: battle.id };
}

/* The end of the game opens the Result tab once for everyone: when someone starts determining the winner, and when it is declared. */
function resultFocus(table: TableProjection) {
  const { ending, result, stage } = table.snapshot;
  if (table.playback) {
    return null;
  }
  if (stage === 'play' && ending) {
    return { key: 'result', token: `ending-${ending.startedAt}` };
  }
  return stage === 'finished' && result ? { key: 'result', token: `result-${result.declaredAt}` } : null;
}

function PhaseControls({ table }: Pick<ConnectionControlsProps, 'table'>) {
  const phase = phaseAt(table.snapshot.phase, table.snapshot.phases);
  return (
    <Section
      hiddenHeading={Boolean(table.snapshot.stage)}
      eyebrow={table.playback ? 'Playback phase' : 'Shared phase'}
      title={phase.label}
      description={phaseHelp(table)}
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
  const name = snapshotFactionLabels(table.snapshot)[factionId] ?? factionId;
  return (
    <svg width="300" height="190" viewBox="0 0 300 190" role="img" aria-label={`${name}, turn ${turn}`}>
      <rect x="2" y="2" width="142" height="184" rx="10" fill="#dfcbaa" stroke="#66503a" strokeWidth="3" />
      <rect x="156" y="2" width="142" height="184" rx="10" fill="#dfcbaa" stroke="#66503a" strokeWidth="3" />
      {token && <image href={token} x="23" y="20" width="100" height="100" />}
      <text x="73" y="153" textAnchor="middle" fill="#302219" fontSize="13">
        {name}
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
        data={Object.entries(snapshotFactionLabels(table.snapshot)).map(([value, label]) => ({ value, label }))}
        value={choice.factionId}
        onChange={(factionId) => change({ factionId })}
        disabled={!table.canInteract}
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
      /* While its card is in hand, placing the card is the reveal; a game that dealt none keeps the button during setup and in the winner bars. */
      const byCard = own && prediction?.revealedAt === null && predictionCardInHand(table, step.id);
      return (
        /* The Setup tab's guidance names the current step only, so every other declaration keeps its heading in view. */
        <Section
          hiddenHeading={Boolean(table.snapshot.stage) && current?.id === step.id}
          key={step.id}
          title={step.title}
          description={setupHelp(step)}
        >
          <Stack gap="sm">
            {prediction ? (
              <>
                <Text size="sm">
                  {prediction.revealedAt !== null
                    ? 'Prediction revealed'
                    : byCard
                      ? 'Prediction locked. Place your prediction card on the table to reveal it.'
                      : 'Prediction locked'}
                </Text>
                {prediction.choice && !byCard && (
                  <PredictionCards
                    table={table}
                    factionId={prediction.choice.factionId}
                    turn={prediction.choice.turn}
                  />
                )}
                {own && prediction.revealedAt === null && !byCard && (
                  <Button
                    variant="default"
                    disabled={!table.canInteract}
                    onClick={() =>
                      client.command({
                        kind: 'prediction-reveal',
                        stepId: step.id,
                      })
                    }
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
  /* The viewer's own starting troops lead, so a narrow dock shows the line that seat has to follow. */
  const ownFaction = rosterSeat(table.snapshot.roster, table.viewer.viewerSeat)?.faction?.id;
  const instructions =
    step.kind === 'forces'
      ? [
          ...setup.instructions.filter((entry) => entry.factionId === ownFaction),
          ...setup.instructions.filter((entry) => entry.factionId !== ownFaction),
        ]
      : [];
  return (
    <Stack gap="md">
      {step.kind !== 'prediction' && (
        <Section hiddenHeading={Boolean(table.snapshot.stage)} title={step.title} description={setupHelp(step)}>
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
              instructions.map((entry) => (
                /* A visible heading, not help-only: the faction name is what tells the lines apart. */
                <Section
                  key={entry.factionId}
                  title={snapshotFactionLabels(table.snapshot)[entry.factionId] ?? entry.factionId}
                >
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    <InlineFormattedTextSource
                      source={entry.text || 'Follow your faction rules for starting troops.'}
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

type PickerState = {
  open: boolean;
  selection: SpawnSelection | null;
  requestId: string | null;
};
type PickerEvent =
  | { type: 'open' | 'close' }
  | {
      type: 'select';
      selection: SpawnSelection | null;
      requestId: string | null;
    };
function pickerReducer(_state: PickerState, event: PickerEvent): PickerState {
  if (event.type === 'select') {
    return {
      open: true,
      selection: event.selection,
      requestId: event.requestId,
    };
  }
  return { open: event.type === 'open', selection: null, requestId: null };
}

function SharedInventory({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const pointerSession = usePointerSession();
  const [picker, dispatch] = useReducer(pickerReducer, {
    open: false,
    selection: null,
    requestId: null,
  });
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const entries = view.catalogue?.entries ?? [];
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const contents = view.catalogue?.requestId === picker.requestId ? view.catalogue.contents : null;
  const pieces = table.snapshot.table.pieces.filter((piece) => piece.inventory === 'shared');
  return (
    <Section
      hiddenHeading={Boolean(table.snapshot.stage)}
      title="Shared inventory"
      description={SHARED_INVENTORY_HELP}
      action={
        table.snapshot.stage !== 'setup' && (
          <Button
            variant="default"
            disabled={!table.canHandleTable}
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
            disabled={!table.canHandleTable}
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
              disabled={table.reconnecting}
              placeholder="Choose a deck, bundle or token"
              data={entries.map((entry) => ({
                value: `${entry.type}/${entry.slug}`,
                label: entry.name,
              }))}
              value={picker.selection ? `${picker.selection.type}/${picker.selection.slug}` : null}
              onChange={(value) => {
                const selection = entries.find((entry) => `${entry.type}/${entry.slug}` === value) ?? null;
                dispatch({
                  type: 'select',
                  selection,
                  requestId: selection ? client.catalogue(selection) : null,
                });
              }}
            />
            <Button
              disabled={!table.canHandleTable || !contents || !picker.selection}
              onClick={() => {
                if (picker.selection) {
                  client.command({
                    kind: 'spawn-request',
                    type: picker.selection.type,
                    slug: picker.selection.slug,
                  });
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
                disabled={!table.canHandleTable || table.reservedPieceIds.has(piece.id)}
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
                <PieceArtwork
                  piece={piece}
                  src={piece.items.at(-1)?.artwork?.[piece.kind === 'card' ? 'back' : 'front'] ?? null}
                  name={piece.label}
                  width={72}
                  height={96}
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
                disabled={!table.canHandleTable || request.requesterSeat === table.viewer.viewerSeat}
                onClick={() =>
                  client.command({
                    kind: 'spawn-approve',
                    requestId: request.id,
                  })
                }
              >
                Approve
              </Button>
              <Button
                variant="default"
                disabled={!table.canHandleTable}
                onClick={() =>
                  client.command({
                    kind: 'spawn-dismiss',
                    requestId: request.id,
                  })
                }
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

function SpiceReserveControls({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const [amount, setAmount] = useState<string | number>(1);
  const reserve = table.snapshot.bank;
  if (!reserve) {
    return null;
  }
  const validAmount =
    typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0 && amount <= reserve.balance;
  return (
    <Section hiddenHeading={Boolean(table.snapshot.stage)} title="Spice reserve" description={SPICE_RESERVE_HELP}>
      <Stack gap="xs">
        <Text component="output" aria-label="Spice reserve balance" ff="C_Advokat_Modern, serif" size="64px" lh={1.1}>
          {reserve.balance}
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
            disabled={!table.canHandleTable}
          />
          <Button
            disabled={!table.canHandleTable || !validAmount}
            onClick={() => client.command({ kind: 'bank-withdraw', amount: Number(amount) })}
          >
            Withdraw spice
          </Button>
        </Group>
      </Stack>
    </Section>
  );
}

/*
 * A transfer's ends are a faction's id, the table or the Spice Bank, as the Worker's spice ledger records them (#1664).
 * The ledger stores the Spice Bank as `supply`; that literal is kept for stored data (see CONTEXT.md).
 */
function spicePlace(labels: Readonly<Partial<Record<string, string>>>, place: string): string {
  if (place === 'table') {
    return 'the table';
  }
  if (place === 'supply') {
    return 'the Spice Bank';
  }
  const name = labels[place];
  return name ? `the ${name} spice reserve` : 'a faction no longer in the game';
}

/* The verb each stored transfer kind reads as; `supply` and `disposal` stay as stored, and both name the Spice Bank. */
const SPICE_TRANSFER_VERBS: Readonly<Record<SpiceTransfer['kind'], string>> = {
  withdrawal: 'withdrew',
  collection: 'collected',
  supply: 'took',
  disposal: 'returned',
};

function spiceTransferText(labels: Readonly<Partial<Record<string, string>>>, transfer: SpiceTransfer): string {
  const moved = `${transfer.actor} ${SPICE_TRANSFER_VERBS[transfer.kind]} ${transfer.amount} spice`;
  if (transfer.kind === 'disposal') {
    return `${moved} to the Spice Bank.`;
  }
  return `${moved} from ${spicePlace(labels, transfer.source)} to ${spicePlace(labels, transfer.destination ?? 'table')}.`;
}

function SpiceHistory({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const entries = view.spiceHistory?.entries ?? table.snapshot.spiceTransfers ?? [];
  const more = view.spiceHistory?.more ?? entries.length === 20;
  const labels = snapshotFactionLabels(table.snapshot);
  return (
    <Section hiddenHeading={Boolean(table.snapshot.stage)} title="Public spice transfers">
      <Stack gap="xs">
        {entries.length === 0 && <Text size="sm">No spice transfers yet.</Text>}
        <List type="ordered" size="sm">
          {entries.map((entry) => (
            <List.Item key={entry.revision}>{spiceTransferText(labels, entry)}</List.Item>
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

/* While a lost connection is restored the last table stays on screen, read-only, under this line. */
/* While the table is locked the top bar says so beside the logo in one short line; the sentence behind it is the tooltip and the accessible description, and a phone keeps only the spinner. */
function ConnectionStatus({ table }: Readonly<{ table: TableProjection }>) {
  if (!table.reconnecting) {
    return null;
  }
  const detail = 'The table shows its last saved state. Actions are paused until it is back.';
  return (
    <Tooltip label={detail} withinPortal>
      <Group gap={6} wrap="nowrap" role="status" aria-label={`Reconnecting. ${detail}`}>
        <Loader size="xs" />
        <Text size="sm" fw={700} visibleFrom="sm" aria-hidden>
          Reconnecting
        </Text>
      </Group>
    </Tooltip>
  );
}

/* The Alliances tab, only while the game is in play. */
function alliancesTab({ client, table, error }: ConnectionControlsProps) {
  if (!showsAlliances(table.snapshot.stage)) {
    return [];
  }
  return [
    {
      key: 'alliances',
      label: 'Alliances',
      topic: 'alliance' as const,
      ...ALLIANCES_GUIDANCE,
      content: (
        <>
          {error && <FormError title="From the table">{error}</FormError>}
          <AlliancesPanel client={client} table={table} />
        </>
      ),
    },
  ];
}

/* The Hand and Hidden zone tabs, for a seat that holds a hand. */
function handTabs({ client, table }: Pick<ConnectionControlsProps, 'client' | 'table'>) {
  const hand = table.snapshot.hand;
  if (!hand) {
    return [];
  }
  return [
    {
      key: 'hand',
      label: 'Hand',
      topic: 'hand' as const,
      ...handGuidance(table),
      content: <HandControls client={client} table={table} hand={hand} />,
    },
    {
      key: 'hidden-zone',
      label: 'Hidden zone',
      topic: 'hiddenZone' as const,
      ...HIDDEN_ZONE_GUIDANCE,
      content: <HiddenZone client={client} table={table} hand={hand} />,
    },
  ];
}

/** The header's control for the stage: its Ready, the phase controls in play, playback before play, or Continue playing once finished. */
function stageToolbar({
  client,
  table,
  bidderFaded,
  onBidderFadedChange,
}: Readonly<{
  client: TableSession;
  table: TableProjection;
  bidderFaded: boolean;
  onBidderFadedChange: (faded: boolean) => void;
}>) {
  const stage = table.snapshot.stage;
  /* The fixture has no stage and plays like a game in play. */
  const inPlay = stage === undefined || stage === 'play';
  /* Playback before play steps through the stage's checkpoints where its Ready would be. */
  const beforePlay = !inPlay && stage !== 'finished';
  if (table.playback && beforePlay) {
    return <StagePlayback client={client} table={table} />;
  }
  const settingUp = stage === 'setup' && Boolean(table.snapshot.setup);
  if (inPlay || settingUp) {
    return (
      <>
        {inPlay && (
          <BidderToolbar client={client} table={table} faded={bidderFaded} onFadedChange={onBidderFadedChange} />
        )}
        <PhaseNavigation client={client} table={table} />
      </>
    );
  }
  if (stage === 'drafting') {
    return <DraftingReady client={client} table={table} />;
  }
  if (stage === 'swapping') {
    return <SwappingReady client={client} table={table} />;
  }
  if (stage === 'finished') {
    return <ContinuePlaying client={client} table={table} />;
  }
  return undefined;
}

/** What the phase chip says for a stage outside play: the drafting gates, the trading clock, the result or the setup step. */
function stageStatus({
  client,
  table,
  identity,
}: Readonly<{ client: TableSession; table: TableProjection; identity: GameIdentity }>) {
  const stage = table.snapshot.stage;
  const result = resultTitle(table);
  if (stage === 'drafting') {
    return (
      <DraftingHeader
        table={table}
        rulesetName={identity.rulesetName ?? undefined}
        invite={<InviteLink address={identity.address} />}
      />
    );
  }
  if (stage === 'swapping') {
    return <SwappingStatus client={client} table={table} />;
  }
  if (result) {
    return (
      <div className="seated-phase-status__copy">
        <span>Finished</span>
        <strong>{result}</strong>
      </div>
    );
  }
  if (stage === 'discarded') {
    return (
      <div className="seated-phase-status__copy">
        <span>Discarded</span>
        <strong>Its last player left</strong>
      </div>
    );
  }
  if (stage === 'setup' && table.snapshot.setup) {
    return <Text size="sm">{setupStep(table.snapshot.setup).title}</Text>;
  }
  return undefined;
}

/** The Result tab, while a declared result or an ending game asks the table to settle it. */
function resultTabs({
  client,
  table,
  error,
}: Readonly<{ client: TableSession; table: TableProjection; error: string | null }>) {
  return resultFocus(table)
    ? [
        {
          key: 'result',
          label: 'Result',
          topic: 'result' as const,
          ...RESULT_GUIDANCE,
          content: (
            <>
              {error && <FormError title="From the table">{error}</FormError>}
              <ResultControls client={client} table={table} />
            </>
          ),
        },
      ]
    : [];
}

function ConnectedTable({
  client,
  table,
  error,
  connection,
  identity,
}: Readonly<{
  client: TableSession;
  table: TableProjection;
  error: string | null;
  connection: string;
  identity: GameIdentity;
}>) {
  const progress = gameProgress(table.snapshot);
  const celebration = useResultCelebration(table);
  /* Each player fades the bidder for themselves, so the choice stays in this tab. */
  const [bidderFaded, setBidderFaded] = useState(false);
  const [playerSelection, selectPlayer] = useReducer(
    (
      _: {
        seat: string | null;
        vote: string | null;
        tab: 'public' | 'conversation';
      },
      next: {
        seat: string | null;
        vote: string | null;
        tab: 'public' | 'conversation';
      }
    ) => next,
    { seat: null, vote: null, tab: 'conversation' }
  );
  const removalVotes = table.snapshot.removalVotes ?? [];
  const selectedPlayer =
    removalVotes.find((vote) => vote.id === playerSelection.vote)?.target.seat ?? playerSelection.seat;
  const stage = table.snapshot.stage;
  /* The fixture has no stage and plays like a game in play. */
  const inPlay = stage === undefined || stage === 'play';
  /* A finished game keeps its panels and playback; only the phase controls stop. */
  const tabled = inPlay || stage === 'finished';
  const factionArtwork = table.snapshot.factionArtwork;
  const predictionLogos = useMemo(
    () => Object.fromEntries(Object.entries(factionArtwork ?? {}).map(([id, artwork]) => [id, artwork.logo])),
    [factionArtwork]
  );
  return (
    <PredictionLogosContext value={predictionLogos}>
      <TabletopSessionProvider session={client}>
        {/* A boxless wrapper carries the connection state the browser verification waits on, whichever tab is open. */}
        <div data-connection={connection} data-revision={table.liveRevision} style={{ display: 'contents' }}>
          <GameTable
            gameIdentity={
              /* While drafting the ruleset heads the drafting chip, so it is not said twice. */
              identity.rulesetName && stage !== 'drafting' ? (
                <Text size="xs" c="dimmed">
                  Ruleset: {identity.rulesetName}
                </Text>
              ) : null
            }
            seatCount={table.snapshot.roster?.seatCount ?? DEFAULT_TABLE_SEAT_COUNT}
            tableProgress={progress}
            stage={stage}
            mapVisible={setupMapVisible(table.snapshot.setup)}
            connectionStatus={<ConnectionStatus table={table} />}
            alliances={<AllianceStrip table={table} />}
            toolbarControl={stageToolbar({ client, table, bidderFaded, onBidderFadedChange: setBidderFaded })}
            /* The gathered Traitor pile lies under the Tleilaxu tanks, below the Map view's frame on a wide screen (#1635). */
            requestedView={table.traitorsGathered ? { view: 'bottom', revision: table.traitorsGathered } : undefined}
            showStormControls={inPlay && progress.activePhaseId === 'storm'}
            sceneContent={
              <>
                {stage === 'swapping' || stage === 'setup' ? (
                  <>
                    <SwapScene snapshot={table.snapshot} />
                    {stage === 'setup' && <BattleScene client={client} table={table} />}
                  </>
                ) : (
                  <>
                    <BattleScene client={client} table={table} />
                    {stage !== 'finished' && <BidderScene client={client} table={table} faded={bidderFaded} />}
                    {inPlay && <HandCountsScene table={table} />}
                    <AllianceCoinsScene table={table} />
                  </>
                )}
                {celebration.mounted && <FoilConfetti launch={celebration.launch} />}
              </>
            }
            gameMenu={
              <>
                {/* While drafting a spectator asks with the (+) in the roster on the table, so the popover waits for play. */}
                {stage !== 'drafting' && <SeatPopover client={client} table={table} error={error} />}
                <GameMenu
                  sharing={<GameLink address={identity.address} />}
                  client={client}
                  table={table}
                  onClearConfetti={celebration.hasConfetti ? celebration.clear : undefined}
                />
              </>
            }
            stageStatus={stageStatus({ client, table, identity })}
            stageOverlay={stage === 'drafting' ? <DraftingOverlay client={client} table={table} /> : undefined}
            panelContent={
              stage === 'drafting' && table.viewer.viewerSeat !== SPECTATOR_SEAT ? (
                <DraftingPanel client={client} table={table} error={error} />
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
            focusTab={resultFocus(table) ?? battleFocus(table)}
            /* A spectator's Shared inventory and Spice are a seat's controls, all disabled; the battle or the Log is what they came to watch. */
            openOn={table.viewer.viewerSeat === SPECTATOR_SEAT ? SPECTATOR_OPENING_TABS : undefined}
            panelTabs={[
              ...(!tabled && stage !== 'setup'
                ? []
                : [
                    /* Past setup a locked prediction lives on as its card in hand, so the tab closes with setup (#1753). */
                    ...(table.snapshot.setup && stage === 'setup'
                      ? [
                          {
                            key: 'setup',
                            label: 'Setup',
                            topic: SETUP_TOPICS[setupStep(table.snapshot.setup).kind],
                            ...setupGuidance(setupStep(table.snapshot.setup)),
                            content: (
                              <>
                                {error && <FormError title="From the table">{error}</FormError>}
                                <SetupControls client={client} table={table} />
                              </>
                            ),
                          },
                        ]
                      : []),
                    ...handTabs({ client, table }),
                    ...(inPlay && (table.snapshot.battle || progress.activePhaseId === 'battle')
                      ? [
                          {
                            key: 'battle',
                            label: 'Battle',
                            topic: 'battle' as const,
                            ...battleGuidance(table),
                            content: (
                              <>
                                {error && <FormError title="From the table">{error}</FormError>}
                                <BattleControls client={client} table={table} />
                              </>
                            ),
                          },
                        ]
                      : []),
                    ...resultTabs({ client, table, error }),
                    {
                      key: 'shared',
                      label: 'Shared inventory',
                      topic: 'assets' as const,
                      ...SHARED_INVENTORY_GUIDANCE,
                      content: <SharedInventory client={client} table={table} />,
                    },
                    ...alliancesTab({ client, table, error }),
                    {
                      key: 'spice',
                      label: 'Spice',
                      topic: 'spice' as const,
                      ...SPICE_GUIDANCE,
                      content: (
                        <>
                          <SpiceReserveControls client={client} table={table} />
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
                      ...LOG_GUIDANCE,
                      content: null,
                      subtabs: [
                        {
                          key: 'game',
                          label: 'Game',
                          topic: 'game' as const,
                          ...GAME_LOG_GUIDANCE,
                          content: <LogEntries client={client} table={table} tab="game" />,
                        },
                        {
                          key: 'audit',
                          label: 'Audit',
                          topic: 'audit' as const,
                          ...AUDIT_LOG_GUIDANCE,
                          content: <LogEntries client={client} table={table} tab="audit" />,
                        },
                      ],
                    },
                  ]
                : []),
            ]}
            tableGuidance={phaseGuidance(table)}
            tableControls={
              tabled ? (
                <>
                  <PhaseControls table={table} />
                  {stage === 'play' &&
                    table.snapshot.setup &&
                    progress.turn === 1 &&
                    progress.activePhaseId === 'storm' && (
                      <Button
                        variant="default"
                        disabled={!table.canInteract}
                        onClick={() => client.command({ kind: 'storm-random' })}
                      >
                        Place storm randomly
                      </Button>
                    )}
                  {stage === 'play' || stage === 'finished' ? (
                    <>
                      <DetermineWinner client={client} table={table} />
                      <TableSettings client={client} table={table} />
                      <PlaybackControls client={client} table={table} />
                      {error && <FormError title="From the table">{error}</FormError>}
                      {stage === 'play' && (table.snapshot.battle || progress.activePhaseId === 'battle') && (
                        <BattleControls client={client} table={table} />
                      )}
                    </>
                  ) : (
                    <ConnectionControls client={client} table={table} error={error} />
                  )}
                </>
              ) : undefined
            }
          />
        </div>
      </TabletopSessionProvider>
    </PredictionLogosContext>
  );
}

type GameIdentity = Readonly<{ rulesetName: string | null; address: string }>;

export default function HostedTable({
  gameId,
  exitControl,
  identity,
}: Readonly<{
  gameId: string;
  exitControl: ReactNode;
  identity: GameIdentity;
}>) {
  const runtime = useContext(GameRuntimeContext);
  const [client] = useState(
    () => new TableSession(gameId, new GameSubscription(gameId, requestPlayTicket, runtime), runtime)
  );
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => client.connect(), [client]);
  usePreloadedCardFaces(view.table?.snapshot.cardFaces);
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
  return (
    <ServerClockContext.Provider value={view.table.serverNow}>
      <ConnectedTable
        identity={identity}
        client={client}
        table={view.table}
        error={view.error}
        connection={view.status}
      />
    </ServerClockContext.Provider>
  );
}
