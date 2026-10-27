import { Anchor, Button, Group, List, Loader, NumberInput, Select, Stack, Text, Tooltip } from '@mantine/core';
import { signInReturnFrom } from '@shared/authDestination';
import { tableHandlingOpen } from '@shared/play/admission';
import { canLowerBid } from '@shared/play/bidding';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { factionTokenOf } from '@shared/play/factionToken';
import { lastTurnOf } from '@shared/play/lastTurn';
import { phaseAt, tableProgressFor } from '@shared/play/phases';
import { setupMapVisible, setupStep } from '@shared/play/setup';
import type { SpiceTransfer } from '@shared/play/spiceReserve';
import { DEFAULT_TABLE_SEAT_COUNT } from '@shared/play/tableSettings';
import { playUiColors } from '@shared/uiPalette';
import { Link, useLocation } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { InlineFormattedTextSource } from '@ui/content/FormattedText';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import { createElement, useContext, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { requestPlayAdmission, watchSeatPass } from '@db/play';
import { GameSubscription } from '@app/routes/_app/play/multiplayer/GameSubscription';

import { TableSession } from '../../../../db/tabletop/TableSession';
import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { usePreloadedCardFaces } from '../../../../widgets/tabletop/cardFacePreload';
import { PredictionLogosContext } from '../../../../widgets/tabletop/prediction/predictionFace';
import { TabletopSessionProvider } from '../../../../widgets/tabletop/TabletopContext';
import { BrowserDiagnostics } from '../browserDiagnostics';
import type { CompassTable } from '../compass/compassTable';
import { CompassTableContext } from '../compass/compassTable';
import { FoilConfetti } from '../FoilConfetti';
import { GameLink } from '../GameLink';
import { GameTable } from '../GameTable';
import type { TablePanel } from '../GameTable';
import { HandShelves } from '../hand/HandShelves';
import { SpiceReserve } from '../hand/SpiceReserve';
import { InventoryLayoutContext } from '../inventory/inventoryLayout';
import { ShelvesInventory } from '../inventory/ShelvesInventory';
import { predictionCardInHand } from '../prediction/predictionCardInHand';
import { TableWait } from '../TableWait';
import { AllianceCoinsScene } from './AllianceCoins';
import { AlliancesPanel, AllianceStrip, showsAlliances } from './Alliances';
import { BattleControls, BattleHistory, BattleModeToggle, BattleScene } from './BattleControls';
import { BidderScene, biddingPhase } from './Bidder';
import { useBugReport } from './BugReport';
import { OfflineConversations } from './Conversation';
import { DraftingOverlay, DraftingPanel } from './Drafting';
import { DetermineWinner, ResultControls, useDeclareChoice } from './GameResult';
import type { DeclareChoice } from './GameResult';
import { GameRuntimeContext } from './gameRuntime';
import { HandCountsScene } from './HandCounts';
import { HiddenZone } from './HiddenZone';
import { LogEntries } from './Log';
import {
  ALLIANCES_GUIDANCE,
  AUDIT_LOG_GUIDANCE,
  battleGuidance,
  GAME_LOG_GUIDANCE,
  HAND_GUIDANCE,
  HIDDEN_ZONE_GUIDANCE,
  LOG_GUIDANCE,
  phaseGuidance,
  PHASE_PREVIOUS,
  phaseHelp,
  RESULT_GUIDANCE,
  setupGuidance,
  setupHelp,
  SHARED_INVENTORY_GUIDANCE,
  SPICE_GUIDANCE,
} from './panelGuidance';
import { PlaybackControls } from './PlaybackControls';
import { FactionInfo, PlayerChat, usePlayerWindows } from './RemovalVotes';
import { useResultCelebration } from './resultCelebration';
import { GameMenu, SeatPopover } from './SeatRequests';
import { nextPhaseStep, stageStatus, stageToolbar } from './StageHeader';
import type { GameIdentity } from './StageHeader';
import { SwapScene } from './SwapScene';
import { factionName, factionOptions, isSpectator, stageInPlay, viewerFaction } from './tableFactions';
import { TableSettings } from './TableSettings';
import { TerritoryTints } from './TerritoryTints';
import { ServerClockContext } from './useServerNow';
import { initialWindowFocus, nextWindowFocus } from './windowFocus';
import '../dune-play.css';

/* The viewer's own faction token on the table, for the compass's flip and pass commands; none without a seat or a token. */
function viewerToken(client: TableSession, table: TableProjection): CompassTable['token'] {
  const faction = viewerFaction(table);
  const token = faction ? factionTokenOf(table.state.pieces, faction) : undefined;
  if (!token || !table.canHandleTable) {
    return null;
  }
  return {
    faceUp: token.items[0]?.faceUp ?? true,
    flip: () => client.flipSelected(token.id),
    inBidding: biddingPhase(table),
  };
}

/* The bidder's raise, lowering and pass, while it points at the viewer in an open round; none otherwise. */
function viewerBidding(client: TableSession, table: TableProjection): CompassTable['bidding'] {
  const bidding = table.snapshot.bidding;
  const faction = table.snapshot.bank?.factionId ?? null;
  if (!bidding || bidding.stage !== 'open' || !biddingPhase(table) || !table.canInteract || bidding.turn !== faction) {
    return null;
  }
  const { round } = bidding;
  return {
    raise: () => void client.command({ kind: 'bid-raise', round }),
    lower: canLowerBid(bidding, faction) ? () => void client.command({ kind: 'bid-lower', round }) : null,
    pass: () => void client.command({ kind: 'bid-pass', round }),
  };
}

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

type TableControlProps = Pick<ConnectionControlsProps, 'client' | 'table'>;

/** Where the game stands, with the last turn its wheel counts up to. */
function gameProgress(snapshot: TableProjection['snapshot']) {
  return { ...tableProgressFor(snapshot.phase, snapshot.phases), lastTurn: lastTurnOf(snapshot) };
}

/* A seat reads by the faction it carries; a seat with no faction yet, or a spectator, by what it is. */
function seatLabel(table: TableProjection): string {
  if (isSpectator(table)) {
    return 'Spectator';
  }
  const faction = viewerFaction(table);
  return (faction && snapshotFactionLabels(table.snapshot)[faction]) ?? table.viewer.viewerSeat;
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

/* A battle the viewer's faction fights in opens the Battle window once, when that faction takes its side. */
function battleFocus(table: TableProjection) {
  const battle = table.snapshot.battle;
  const own = viewerFaction(table);
  /* The same "in play" test that shows the Battle panel: a hosted game in play, or a table with no stage. */
  if (!stageInPlay(table.snapshot.stage) || !battle || !own || !battle.sides.some((side) => side?.factionId === own)) {
    return null;
  }
  return { key: 'battle', token: battle.id };
}

/*
 * The panel each phase is about, whose window opens once as the phase begins.
 * Phases played on the table alone (spice blow, revival, movement) open nothing.
 */
const PHASE_PANELS: Partial<Record<string, string>> = {
  storm: 'phase',
  'choam-charity': 'spice',
  bidding: 'hand',
  battle: 'battle',
  'spice-collection': 'spice',
  'mentat-pause': 'phase',
};

/* A seat's own panels are not a spectator's, so only the battle, which they came to watch, opens for them. */
const SPECTATOR_PHASE_PANELS = new Set(['battle']);

/* The window this phase opens for this viewer, or null when the phase opens nothing. */
function phaseWindow(table: TableProjection, activePhaseId: string) {
  if (table.playback || table.snapshot.stage !== 'play') {
    return null;
  }
  const key = PHASE_PANELS[activePhaseId] ?? null;
  return isSpectator(table) && key && !SPECTATOR_PHASE_PANELS.has(key) ? null : key;
}

/* The windows follow the live table: each phase change, battle and end-of-game event opens its window once (see windowFocus.ts). */
function useWindowFocus(table: TableProjection, progress: ReturnType<typeof gameProgress>) {
  const phase = `${table.snapshot.stage}:${progress.turn}:${progress.activePhaseId}`;
  const [state, setState] = useState(() => initialWindowFocus(phase, table.snapshot.stage === 'play'));
  const next = nextWindowFocus(state, {
    playback: Boolean(table.playback),
    phase,
    phaseTab: phaseWindow(table, progress.activePhaseId),
    events: [resultFocus(table), battleFocus(table), stageFocus(table)],
  });
  if (next !== state) {
    setState(next);
  }
  return next.focus;
}

/*
 * A seated player's own stage opens once, as they take their seat or load the table mid-stage: the draft while drafting,
 * the setup steps (traitors, predictions) while setting up. A spectator has no panel for either.
 */
function stageFocus(table: TableProjection) {
  const { stage } = table.snapshot;
  if (isSpectator(table)) {
    return null;
  }
  if (stage === 'drafting') {
    return { key: 'stage', token: 'stage:drafting' };
  }
  return stage === 'setup' ? { key: 'setup', token: 'stage:setup' } : null;
}

/* The end of the game opens the Result window once for everyone: when someone starts determining the winner, and when it is declared. */
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
      {!table.snapshot.stage && <Text size="sm">{PHASE_PREVIOUS}</Text>}
    </Section>
  );
}

function PredictionCards({ table, factionId, turn }: { table: TableProjection; factionId: string; turn: number }) {
  const seat = table.snapshot.roster?.seats.find((entry) => entry.faction?.id === factionId);
  const token = seat && table.snapshot.swapping?.tokens[seat.id];
  const name = factionName(table, factionId);
  return (
    <svg width="300" height="190" viewBox="0 0 300 190" role="img" aria-label={`${name}, turn ${turn}`}>
      <rect
        x="2"
        y="2"
        width="142"
        height="184"
        rx="10"
        fill={playUiColors.demoCard}
        stroke={playUiColors.demoCardBorder}
        strokeWidth="3"
      />
      <rect
        x="156"
        y="2"
        width="142"
        height="184"
        rx="10"
        fill={playUiColors.demoCard}
        stroke={playUiColors.demoCardBorder}
        strokeWidth="3"
      />
      {token && <image href={token} x="23" y="20" width="100" height="100" />}
      <text x="73" y="153" textAnchor="middle" fill={playUiColors.demoCardInk} fontSize="13">
        {name}
      </text>
      <text x="227" y="62" textAnchor="middle" fill={playUiColors.demoCardInk} fontSize="20">
        TURN
      </text>
      <text x="227" y="135" textAnchor="middle" fill={playUiColors.demoCardInk} fontSize="68">
        {turn}
      </text>
    </svg>
  );
}

function PredictionInput({ client, table, stepId }: TableControlProps & { stepId: string }) {
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
        data={factionOptions(table)}
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

/* A locked prediction is revealed, waits for its card on the table, or stays locked until its player reveals it. */
function lockedPredictionText(revealed: boolean, byCard: boolean) {
  if (revealed) {
    return 'Prediction revealed';
  }
  return byCard ? 'Prediction locked. Place your prediction card on the table to reveal it.' : 'Prediction locked';
}

function Predictions({ client, table }: TableControlProps) {
  const ownFaction = viewerFaction(table);
  const current = table.snapshot.setup && setupStep(table.snapshot.setup);
  return table.snapshot.setup?.steps
    .filter((step) => step.kind === 'prediction')
    .map((step) => {
      const prediction = table.snapshot.predictions?.[step.id];
      const own = step.factionId === ownFaction;
      /* While its card is in hand, placing the card is the reveal; a game that dealt none keeps the button during setup and in the winner bars. */
      const byCard = own && prediction?.revealedAt === null && predictionCardInHand(table, step.id);
      return (
        /* The Setup panel's guidance names the current step only, so every other declaration keeps its heading in view. */
        <Section
          hiddenHeading={Boolean(table.snapshot.stage) && current?.id === step.id}
          key={step.id}
          title={step.title}
          description={setupHelp(step)}
        >
          <Stack gap="sm">
            {prediction ? (
              <>
                <Text size="sm">{lockedPredictionText(prediction.revealedAt !== null, byCard)}</Text>
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

function SetupControls({ client, table }: TableControlProps) {
  const setup = table.snapshot.setup;
  if (!setup) {
    return null;
  }
  const step = setupStep(setup);
  /* The viewer's own starting troops lead, so a narrow window shows the line that seat has to follow. */
  const ownFaction = viewerFaction(table);
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
                <Section key={entry.factionId} title={factionName(table, entry.factionId)}>
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

/* The layout a story picked, while the four are compared; otherwise the shelves. */
function SharedInventoryWindow(props: TableControlProps) {
  const layout = useContext(InventoryLayoutContext);
  return layout ? createElement(layout, props) : <ShelvesInventory {...props} />;
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

function SpiceHistory({ client, table }: TableControlProps) {
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

/* A lost connection keeps the last table read-only, with recovery stated above it and explained on hover. */
function ConnectionStatus({ table }: Readonly<{ table: TableProjection }>) {
  if (!table.reconnecting) {
    return null;
  }
  const detail = 'The table shows its last saved state. Actions are paused until it is back.';
  return (
    <Tooltip label={detail} withinPortal>
      <Group gap={6} wrap="nowrap" role="status" aria-label={`Reconnecting. ${detail}`}>
        <Loader size="xs" color="gray.2" />
        <Text size="sm" fw={700} aria-hidden>
          Reconnecting
        </Text>
      </Group>
    </Tooltip>
  );
}

/* A panel's controls beneath the table's refusal of the last command they sent, when there is one. */
function withTableError(error: string | null, controls: ReactNode) {
  return (
    <>
      {error && <FormError title="From the table">{error}</FormError>}
      {controls}
    </>
  );
}

/* The Alliances panel, only while the game is in play. */
function alliancesPanel({ client, table, error }: ConnectionControlsProps) {
  if (!showsAlliances(table.snapshot.stage)) {
    return [];
  }
  return [
    {
      key: 'alliances',
      label: 'Alliances',
      topic: 'alliance' as const,
      ...ALLIANCES_GUIDANCE,
      content: withTableError(error, <AlliancesPanel client={client} table={table} />),
    },
  ];
}

/* The Hand and Hidden zone panels, for a seat that holds a hand. */
function handPanels({ client, table }: TableControlProps) {
  const hand = table.snapshot.hand;
  if (!hand) {
    return [];
  }
  return [
    {
      key: 'hand',
      label: 'Hand',
      topic: 'hand' as const,
      ...HAND_GUIDANCE,
      content: <HandShelves client={client} table={table} hand={hand} />,
    },
    {
      key: 'hidden-zone',
      label: 'Private side-table',
      topic: 'hiddenZone' as const,
      ...HIDDEN_ZONE_GUIDANCE,
      content: <HiddenZone client={client} table={table} hand={hand} />,
    },
  ];
}

/** The Result panel, while a declared result or an ending game asks the table to settle it. */
function resultPanels({ client, table, error, declare }: ControlPanelsProps) {
  return resultFocus(table)
    ? [
        {
          key: 'result',
          label: 'Result',
          topic: 'result' as const,
          ...RESULT_GUIDANCE,
          content: withTableError(error, <ResultControls client={client} table={table} declare={declare} />),
        },
      ]
    : [];
}

/** The private destinations are only installed for a viewer with a hand. */
function yoursGroup({ client, table }: TableControlProps): TablePanel {
  return {
    key: 'yours',
    label: 'Yours',
    topic: 'hand',
    description: 'Your private pieces and spice reserve.',
    content: null,
    panels: [
      ...handPanels({ client, table }),
      ...(table.snapshot.bank
        ? [
            {
              key: 'spice',
              label: 'Spice',
              topic: 'spice' as const,
              ...SPICE_GUIDANCE,
              content: <SpiceReserve client={client} table={table} />,
            },
          ]
        : []),
    ],
  };
}

/** GameTable supplies the stage and phase controls beside these game actions. */
function gameGroup({ client, table, error, declare }: ControlPanelsProps, inPlay: boolean): TablePanel {
  const { setup, stage, battle } = table.snapshot;
  const activePhaseId = gameProgress(table.snapshot).activePhaseId;
  return {
    key: 'game',
    label: 'Game',
    topic: 'game',
    description: 'The current stage, battles and alliances.',
    content: null,
    panels: [
      ...(setup && stage === 'setup'
        ? [
            {
              key: 'setup',
              label: 'Setup',
              topic: SETUP_TOPICS[setupStep(setup).kind],
              ...setupGuidance(setupStep(setup)),
              content: withTableError(error, <SetupControls client={client} table={table} />),
            },
          ]
        : []),
      ...(inPlay && (battle || activePhaseId === 'battle')
        ? [
            {
              key: 'battle',
              label: 'Battle plan',
              topic: 'battle' as const,
              ...battleGuidance(table),
              content: withTableError(error, <BattleControls client={client} table={table} />),
              /* The plan fills its window under the wheel, whose cards peek over the window's top edge. */
              ...(battle && table.snapshot.battlePlan && table.snapshot.bank
                ? { fill: true, peek: true, actions: <BattleModeToggle client={client} table={table} /> }
                : {}),
            },
          ]
        : []),
      ...resultPanels({ client, table, error, declare }),
      ...alliancesPanel({ client, table, error }),
    ],
  };
}

/** Shared table inventory persists after play; settings remain available only while playing. */
function tableGroup({ client, table, error }: ConnectionControlsProps): TablePanel {
  return {
    key: 'table',
    label: 'Table',
    topic: 'board',
    description: 'Shared pieces and table settings.',
    content: null,
    panels: [
      {
        key: 'shared',
        label: 'Shared table inventory',
        topic: 'assets',
        ...SHARED_INVENTORY_GUIDANCE,
        content: <SharedInventoryWindow client={client} table={table} />,
      },
      ...(tableHandlingOpen(table.snapshot.stage)
        ? [
            {
              key: 'tints',
              label: 'Territory tints',
              topic: 'tints' as const,
              description: 'Colour territories for everyone to see.',
              content: withTableError(error, <TerritoryTints client={client} table={table} />),
            },
          ]
        : []),
      ...(table.snapshot.stage === 'play'
        ? [
            {
              key: 'settings',
              label: 'Settings',
              topic: 'controls' as const,
              description: 'Game length.',
              content: withTableError(error, <TableSettings client={client} table={table} />),
            },
          ]
        : []),
    ],
  };
}

/** Public records and replay stay together as the game changes phase or finishes. */
function historyGroup({ client, table, error }: ConnectionControlsProps, hasInventory: boolean): TablePanel {
  return {
    key: 'history',
    label: 'History',
    topic: 'log',
    ...LOG_GUIDANCE,
    content: null,
    panels: [
      {
        key: 'game-log',
        label: 'Game log',
        topic: 'game',
        ...GAME_LOG_GUIDANCE,
        content: <LogEntries client={client} table={table} tab="game" />,
      },
      {
        key: 'audit',
        label: 'Audit',
        topic: 'audit',
        ...AUDIT_LOG_GUIDANCE,
        content: <LogEntries client={client} table={table} tab="audit" />,
      },
      ...(hasInventory
        ? [
            {
              key: 'battles',
              label: 'Battles',
              topic: 'battle' as const,
              description: 'Agreed battle results and revealed plans.',
              content: <BattleHistory table={table} />,
            },
            {
              key: 'transfers',
              label: 'Spice transfers',
              topic: 'spice' as const,
              description: 'Public spice transfers, newest first.',
              content: <SpiceHistory client={client} table={table} />,
            },
          ]
        : []),
      {
        key: 'replay',
        label: 'Replay',
        topic: 'turn',
        description: 'Browse saved phases and return to the live table.',
        content: (
          <>
            {error && !table.playback && <FormError title="From the table">{error}</FormError>}
            <PlaybackControls client={client} table={table} />
          </>
        ),
      },
    ],
  };
}

/** The left rail keeps personal resources first and omits groups with no stage content. */
type ControlPanelsProps = ConnectionControlsProps & Readonly<{ declare: DeclareChoice }>;

function controlPanels(
  props: ControlPanelsProps & Readonly<{ report: { enabled: boolean; content: ReactNode } }>
): TablePanel[] {
  const { stage, hand } = props.table.snapshot;
  const inPlay = stageInPlay(stage);
  const hasInventory = inPlay || stage === 'finished' || stage === 'setup';
  return [
    ...(hasInventory && hand ? [yoursGroup(props)] : []),
    gameGroup(props, inPlay),
    ...(hasInventory ? [tableGroup(props)] : []),
    ...(stage ? [historyGroup(props, hasInventory)] : []),
    ...(props.report.enabled
      ? [
          {
            key: 'report-bug',
            label: 'Report a bug',
            topic: 'battleUnknown' as const,
            description: 'Describe a problem and share the full game state and browser logs.',
            content: props.report.content,
          },
        ]
      : []),
  ];
}

/* The pieces the stage stands on the board: the trade and setup scenes before play, then the battle, bidder, hands and coins. */
function stageScene({ client, table, bidderFaded }: TableControlProps & Readonly<{ bidderFaded: boolean }>) {
  const stage = table.snapshot.stage;
  if (stage === 'swapping' || stage === 'setup') {
    return (
      <>
        <SwapScene snapshot={table.snapshot} />
        {stage === 'setup' && <BattleScene client={client} table={table} />}
      </>
    );
  }
  return (
    <>
      <BattleScene client={client} table={table} />
      {stage !== 'finished' && <BidderScene client={client} table={table} faded={bidderFaded} />}
      {stageInPlay(stage) && <HandCountsScene table={table} />}
      <AllianceCoinsScene table={table} />
    </>
  );
}

/* A finished game keeps its panels and playback; only the phase controls stop. */
function phaseTabControls({
  client,
  table,
  error,
  progress,
}: ConnectionControlsProps & Readonly<{ progress: ReturnType<typeof gameProgress> }>) {
  const stage = table.snapshot.stage;
  if (!stageInPlay(stage) && stage !== 'finished') {
    return undefined;
  }
  return (
    <>
      <PhaseControls table={table} />
      {stage === 'play' && table.snapshot.setup && progress.turn === 1 && progress.activePhaseId === 'storm' && (
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
          {error && <FormError title="From the table">{error}</FormError>}
        </>
      ) : (
        <ConnectionControls client={client} table={table} error={error} />
      )}
    </>
  );
}

function ConnectedTable({
  client,
  table,
  error,
  connection,
  identity,
  gameId,
  diagnostics,
  reportsEnabled,
}: Readonly<{
  client: TableSession;
  table: TableProjection;
  error: string | null;
  connection: string;
  identity: GameIdentity;
  gameId: string;
  diagnostics: BrowserDiagnostics;
  reportsEnabled: boolean;
}>) {
  const bugReport = useBugReport({ gameId, client, table, connection, diagnostics });
  const progress = gameProgress(table.snapshot);
  const focus = useWindowFocus(table, progress);
  const celebration = useResultCelebration(table);
  const declare = useDeclareChoice(table);
  /* Each player fades the bidder for themselves, so the choice stays in this browser tab. */
  const [bidderFaded, setBidderFaded] = useState(false);
  const playerWindows = usePlayerWindows(client, table);
  const stage = table.snapshot.stage;
  const factionArtwork = table.snapshot.factionArtwork;
  const predictionLogos = useMemo(
    () => Object.fromEntries(Object.entries(factionArtwork ?? {}).map(([id, artwork]) => [id, artwork.logo])),
    [factionArtwork]
  );
  return (
    <PredictionLogosContext value={predictionLogos}>
      <TabletopSessionProvider session={client}>
        {/* A boxless wrapper carries the connection state the browser verification waits on, whichever browser tab is open. */}
        <div data-connection={connection} data-revision={table.liveRevision} style={{ display: 'contents' }}>
          {/* What the compass shows of the table beyond its panels: the players, the chats and its commands. */}
          <CompassTableContext
            value={{
              ...playerWindows,
              chat: (seat) => <PlayerChat client={client} table={table} seat={seat} />,
              factionInfo: (seat) => <FactionInfo client={client} table={table} seat={seat} error={error} />,
              nextPhase: nextPhaseStep(client, table),
              token: viewerToken(client, table),
              bidding: viewerBidding(client, table),
            }}
          >
            <GameTable
              seatCount={table.snapshot.roster?.seatCount ?? DEFAULT_TABLE_SEAT_COUNT}
              tableProgress={progress}
              stage={stage}
              mapVisible={setupMapVisible(table.snapshot.setup)}
              connectionStatus={<ConnectionStatus table={table} />}
              alliances={<AllianceStrip table={table} />}
              toolbarControl={stageToolbar({ client, table, error, bidderFaded, onBidderFadedChange: setBidderFaded })}
              /* The gathered Traitor pile lies under the Tleilaxu Tanks, below the Map view's frame on a wide screen (#1635). */
              requestedView={table.traitorsGathered ? { view: 'bottom', revision: table.traitorsGathered } : undefined}
              showStormControls={stageInPlay(stage) && progress.activePhaseId === 'storm'}
              sceneContent={
                <>
                  {stageScene({ client, table, bidderFaded })}
                  {celebration.mounted && <FoilConfetti launch={celebration.launch} />}
                </>
              }
              gameMenu={
                <>
                  {/* While drafting a spectator asks with the (+) in the roster on the table, so the popover waits for play. */}
                  {stage !== 'drafting' && <SeatPopover client={client} table={table} error={error} />}
                  <GameMenu
                    sharing={<GameLink address={identity.address} page={identity.page} />}
                    client={client}
                    table={table}
                    onClearConfetti={celebration.hasConfetti ? celebration.clear : undefined}
                  />
                </>
              }
              stageStatus={stageStatus({ client, table, identity })}
              stageOverlay={
                stage === 'drafting' ? <DraftingOverlay client={client} table={table} error={error} /> : undefined
              }
              panelContent={
                stage === 'drafting' && !isSpectator(table) ? (
                  <DraftingPanel client={client} table={table} error={error} />
                ) : undefined
              }
              focus={focus}
              panels={controlPanels({
                client,
                table,
                error,
                declare,
                report: { enabled: reportsEnabled, content: bugReport },
              })}
              tableGuidance={phaseGuidance(table)}
              tableControls={phaseTabControls({ client, table, error, progress })}
            />
          </CompassTableContext>
        </div>
      </TabletopSessionProvider>
    </PredictionLogosContext>
  );
}

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
  const [diagnostics] = useState(() => new BrowserDiagnostics());
  useEffect(() => diagnostics.listen(window), [diagnostics]);
  const here = useLocation({ select: (location) => location.href });
  const [client] = useState(
    () =>
      new TableSession(
        gameId,
        new GameSubscription(
          gameId,
          runtime.admission?.request ?? requestPlayAdmission,
          runtime,
          runtime.admission ? runtime.admission.watchPass : watchSeatPass
        ),
        runtime
      )
  );
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => client.connect(), [client]);
  usePreloadedCardFaces(view.table?.snapshot.cardFaces);
  if (!view.table) {
    return (
      <TableWait status={view.error ?? 'Connecting to the hosted table...'} connection={view.status}>
        {view.status === 'denied' && (
          <Anchor renderRoot={(props) => <Link {...props} to="/auth/login" search={signInReturnFrom(here)} />}>
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
        gameId={gameId}
        diagnostics={diagnostics}
        reportsEnabled={runtime.admission === undefined}
        identity={identity}
        client={client}
        table={view.table}
        error={view.error}
        connection={view.status}
      />
    </ServerClockContext.Provider>
  );
}
