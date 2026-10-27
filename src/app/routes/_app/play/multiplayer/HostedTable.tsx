import { Anchor, Button, Group, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { signInReturnFrom } from '@shared/authDestination';
import { tableHandlingOpen } from '@shared/play/admission';
import { canLowerBid } from '@shared/play/bidding';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { factionTokenOf } from '@shared/play/factionToken';
import { lastTurnOf } from '@shared/play/lastTurn';
import { phaseAt, tableProgressFor } from '@shared/play/phases';
import { setupMapVisible } from '@shared/play/setup';
import { DEFAULT_TABLE_SEAT_COUNT } from '@shared/play/tableSettings';
import { Link, useLocation } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import { ConnectedAlliancesPanel } from '../panels/alliances/useAlliancesPanel';
import { ConnectedBattlePlanPanel } from '../panels/battlePlan/useBattlePlanPanel';
import { ConnectedBattleHistoryPanel } from '../panels/battles/useBattleHistoryPanel';
import { ConnectedHandPanel } from '../panels/hand/useHandPanel';
import { ConnectedSharedInventoryPanel } from '../panels/inventory/useSharedInventoryPanel';
import { ConnectedLogPanel } from '../panels/log/useLogPanel';
import { PANEL_WINDOWS } from '../panels/panelWindows';
import { ConnectedReplayPanel } from '../panels/replay/useReplayPanel';
import { ConnectedResultPanel, useDeclareChoice } from '../panels/result/useResultPanel';
import type { DeclareChoice } from '../panels/result/useResultPanel';
import { ConnectedGameLengthPanel } from '../panels/settings/useGameLengthPanel';
import { ConnectedSetupPanel, setupWindow } from '../panels/setup/useSetupPanel';
import { ConnectedPrivateSideTablePanel } from '../panels/sideTable/usePrivateSideTablePanel';
import { ConnectedSpiceReservePanel } from '../panels/spice/useSpiceReservePanel';
import { ConnectedTerritoryTintsPanel } from '../panels/tints/useTerritoryTintsPanel';
import { ConnectedSpiceTransfersPanel } from '../panels/transfers/useSpiceTransfersPanel';
import { TableWait } from '../TableWait';
import { AllianceCoinsScene } from './AllianceCoins';
import { AllianceStrip, showsAlliances } from './Alliances';
import { BattleModeToggle, BattleScene } from './BattleControls';
import { BidderScene, biddingPhase } from './Bidder';
import { useBugReport } from './BugReport';
import { OfflineConversations } from './Conversation';
import { DraftingOverlay, DraftingPanel } from './Drafting';
import { DetermineWinner } from './GameResult';
import { GameRuntimeContext } from './gameRuntime';
import { HandCountsScene } from './HandCounts';
import { battleHelp, LOG_GUIDANCE, phaseGuidance, PHASE_PREVIOUS, phaseHelp } from './panelGuidance';
import { FactionInfo, PlayerChat, usePlayerWindows } from './RemovalVotes';
import { useResultCelebration } from './resultCelebration';
import { GameMenu, SeatPopover } from './SeatRequests';
import { nextPhaseStep, stageStatus, stageToolbar } from './StageHeader';
import type { GameIdentity } from './StageHeader';
import { SwapScene } from './SwapScene';
import { isSpectator, stageInPlay, viewerFaction } from './tableFactions';
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
        <ConnectedReplayPanel client={client} table={table} />
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
      ...PANEL_WINDOWS.alliances,
      content: withTableError(error, <ConnectedAlliancesPanel client={client} table={table} />),
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
    { ...PANEL_WINDOWS.hand, content: <ConnectedHandPanel client={client} table={table} hand={hand} /> },
    {
      ...PANEL_WINDOWS.sideTable,
      content: <ConnectedPrivateSideTablePanel client={client} table={table} hand={hand} />,
    },
  ];
}

/** The Result panel, while a declared result or an ending game asks the table to settle it. */
function resultPanels({ client, table, error, declare }: ControlPanelsProps) {
  return resultFocus(table)
    ? [
        {
          ...PANEL_WINDOWS.result,
          content: withTableError(error, <ConnectedResultPanel client={client} table={table} declare={declare} />),
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
        ? [{ ...PANEL_WINDOWS.spice, content: <ConnectedSpiceReservePanel client={client} table={table} /> }]
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
              ...setupWindow(setup),
              content: withTableError(error, <ConnectedSetupPanel client={client} table={table} />),
            },
          ]
        : []),
      ...(inPlay && (battle || activePhaseId === 'battle')
        ? [
            {
              ...PANEL_WINDOWS.battlePlan,
              help: battleHelp(table),
              content: withTableError(error, <ConnectedBattlePlanPanel client={client} table={table} />),
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
      { ...PANEL_WINDOWS.inventory, content: <ConnectedSharedInventoryPanel client={client} table={table} /> },
      ...(tableHandlingOpen(table.snapshot.stage)
        ? [
            {
              ...PANEL_WINDOWS.tints,
              content: withTableError(error, <ConnectedTerritoryTintsPanel client={client} table={table} />),
            },
          ]
        : []),
      ...(table.snapshot.stage === 'play'
        ? [
            {
              ...PANEL_WINDOWS.settings,
              content: withTableError(error, <ConnectedGameLengthPanel client={client} table={table} />),
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
      { ...PANEL_WINDOWS.gameLog, content: <ConnectedLogPanel client={client} table={table} tab="game" /> },
      { ...PANEL_WINDOWS.audit, content: <ConnectedLogPanel client={client} table={table} tab="audit" /> },
      ...(hasInventory
        ? [
            { ...PANEL_WINDOWS.battles, content: <ConnectedBattleHistoryPanel table={table} /> },
            {
              ...PANEL_WINDOWS.transfers,
              content: <ConnectedSpiceTransfersPanel client={client} table={table} />,
            },
          ]
        : []),
      {
        ...PANEL_WINDOWS.replay,
        content: (
          <>
            {error && !table.playback && <FormError title="From the table">{error}</FormError>}
            <ConnectedReplayPanel client={client} table={table} />
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
