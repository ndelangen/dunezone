import { Button, Group, Stack, Text } from '@mantine/core';
import { pieceCount } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { standardPhaseOf } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { TABLE_SECTOR_COUNT } from '@shared/play/tableSettings';
import type { TableSeatCount } from '@shared/play/tableSettings';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import { SplitPanels } from '@ui/layout/SplitPanels';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  controlsPanelLimits,
  DEFAULT_CONTROLS_PANEL_PERCENT,
  KEYBOARD_PAGE_STEP_PERCENT,
  KEYBOARD_STEP_PERCENT,
  paneLimits,
} from './controlPanelLayout';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import {
  PHASE_DISC_COLOR,
  PHASE_INK_COLOR,
  PHASE_RING_INNER_RADIUS,
  PHASE_RING_OUTER_RADIUS,
  PHASE_SYMBOL_MAX_RADIUS,
} from './phaseSymbolLayout';
import { createTableViewState, PHASE_VIEWS, reduceTableView, TABLE_VIEW_OPTIONS } from './playView';
import type { CameraViewCommand, TableView } from './playView';
import { PointerSession } from './PointerSession';
import { PointerSessionContext } from './PointerSessionContext';
import { TableKeyboard } from './TableKeyboard';
import { TableKeyboardContext } from './TableKeyboardContext';
import { useTabletop } from './TabletopContext';
import type { TabletopContextValue } from './TabletopContext';
import { TabletopScene } from './TabletopScene';
import type { TableProgress } from './tableTrackers';
import { TableWait } from './TableWait';

/* How long the shell waits for the renderer before opening anyway. */
const SCENE_READY_FALLBACK_MS = 1500;

/** One tab of the controls panel: what it is called, its glyph from the topic map, and what it shows. */
type PanelTab = Readonly<{
  key: string;
  label: string;
  topic: TopicIconTopic;
  content: ReactNode;
  /** False when the content runs to the pane's sides and insets its own text, as `NestedTabs.ContentPanel` takes it. */
  padding?: boolean;
  subtabs?: readonly PanelTab[];
}>;

type GameTableProps = {
  sceneContent?: ReactNode;
  /** Tabs the host adds ahead of the fixture's own Table tab, in the accepted order. */
  panelTabs?: readonly PanelTab[];
  /** A tab to open once per token, as a battle opens on the viewer's side; the player can move away and it stays put. */
  focusTab?: Readonly<{ key: string; token: string }> | null;
  /** Sections the host adds to the Table tab, above the fixture's trackers. */
  tableControls?: ReactNode;
  /** The important decision of the moment, above the panel's tabs: a seat request, a vote, a result. */
  decisionBar?: ReactNode;
  /** The game menu in the toolbar, present in every stage: what a player can do about their own seat. Previous and Next stay rightmost. */
  gameMenu?: ReactNode;
  toolbarControl?: ReactNode;
  /** The connection's state, beside the logo where the bar has room, present only while the table is not live. */
  connectionStatus?: ReactNode;
  showStormControls: boolean;
  seatCount: TableSeatCount;
  tableProgress: TableProgress;
  /* Absent on the fixture, which has no lifecycle. */
  stage?: GameSnapshot['stage'];
  mapVisible?: boolean;
  /* The header's centre during a stage that says more than its word: the drafting counts and status. */
  stageStatus?: ReactNode;
  /* Play chrome laid over the scene for a stage, between the header and the panel: the drafting ledger. */
  stageOverlay?: ReactNode;
  /* A stage's own panel in place of the tabs, under the decision bar: the drafting panel. Its tab's pane is flush, so the content insets itself with --nested-tabs-panel-inset. */
  panelContent?: ReactNode;
  playerPanel?: ReactNode;
  /* A view the host asks for after something the viewer did lands out of frame; each new revision moves the camera once. */
  requestedView?: Readonly<{ view: TableView; revision: number }>;
};

function flippableSelection(piece: TablePiece | null) {
  if (!piece) {
    return null;
  }
  return piece.kind === 'card' || piece.kind === 'force' ? piece : null;
}

function selectedFlipHelp({
  piece,
  isFlipping,
  hasHeldMove,
  hasFlip,
}: {
  piece: TablePiece | null;
  isFlipping: boolean;
  hasHeldMove: boolean;
  hasFlip: boolean;
}) {
  if (isFlipping) {
    return 'Wait for this flip to finish.';
  }
  if (hasHeldMove) {
    return 'Place or cancel the held piece before flipping.';
  }
  if (piece?.locked) {
    return 'Unlock this piece before flipping.';
  }
  if (piece && !hasFlip) {
    return 'This piece cannot be flipped with the current permissions.';
  }
  const selectedCount = piece ? pieceCount(piece) : 0;
  return selectedCount > 1
    ? 'Flips the whole stack. Hover it and press F to use the shortcut.'
    : 'Hover a card or token and press F to flip it.';
}

function selectedFlipControl({
  affordances,
  flippingPieceIds,
  gestureActivePieceId,
  selectedPiece,
  state,
}: TabletopContextValue) {
  const flip = affordances.find((affordance) => affordance.commandType === 'piece.flip');
  const piece = flippableSelection(selectedPiece);
  const hasHeldMove = state.draftMove !== null || gestureActivePieceId !== null;
  const isFlipping = piece !== null && flippingPieceIds.has(piece.id);
  return {
    piece,
    isFlipping,
    disabled: !piece || !flip || hasHeldMove || isFlipping,
    label: flip?.label ?? 'Flip',
    help: selectedFlipHelp({ piece, isFlipping, hasHeldMove, hasFlip: Boolean(flip) }),
  };
}

function selectedPieceCount(piece: TablePiece) {
  const count = pieceCount(piece);
  const unit = piece.kind === 'card' ? 'card' : 'token';
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

function SelectedPieceControl() {
  const table = useTabletop();
  const control = selectedFlipControl(table);
  const helpId = useId();
  return (
    <Section
      eyebrow="Selected piece"
      title={control.piece?.label ?? 'Select a card or token'}
      action={
        <Button
          variant="default"
          aria-describedby={helpId}
          aria-busy={control.isFlipping}
          disabled={control.disabled || !table.canHandleTable}
          onClick={() => table.flipSelected()}
        >
          {control.label}
        </Button>
      }
    >
      <Text id={helpId} size="sm" c="dimmed">
        {control.piece ? `${selectedPieceCount(control.piece)}. ` : ''}
        {control.help}
      </Text>
    </Section>
  );
}

function StormControls({ helpOnly = false }: { helpOnly?: boolean }) {
  const { canHandleTable, moveStormBy, state } = useTabletop();
  return (
    <Section
      helpOnly={helpOnly}
      eyebrow="Debug"
      title="Storm sector"
      description="Advance the highlighted sector counter-clockwise around Arrakis."
    >
      <Group gap="sm">
        <Button variant="default" disabled={!canHandleTable} onClick={() => moveStormBy(-1)}>
          Back one
        </Button>
        <Text component="output" aria-live="polite">
          <strong>Sector {state.stormSectorIndex + 1}</strong> of {TABLE_SECTOR_COUNT}
        </Text>
        <Button disabled={!canHandleTable} onClick={() => moveStormBy(1)}>
          Advance one
        </Button>
      </Group>
    </Section>
  );
}

function TableViewPicker({
  activeView,
  preferredView,
  onSelect,
}: {
  activeView: TableView;
  preferredView?: TableView;
  onSelect(view: TableView): void;
}) {
  return (
    <div className="table-view-picker" role="group" aria-label="Table view">
      {TABLE_VIEW_OPTIONS.map((view) => {
        const phasePreferred = preferredView === view.id;
        return (
          <button
            key={view.id}
            type="button"
            className={activeView === view.id ? 'is-active' : ''}
            aria-label={`Focus on ${view.label.toLowerCase()}${phasePreferred ? ', recommended for this phase' : ''}`}
            aria-pressed={activeView === view.id}
            data-phase-preferred={phasePreferred || undefined}
            onClick={() => onSelect(view.id)}
          >
            {view.label}
            {phasePreferred ? <span className="phase-view-dot" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

type StageFrame = Readonly<{
  /** The header's word in place of the turn and phase. */
  word?: string;
  /** The last tab: the fixture's full Table tab, or play's Phase tab with help-only storm controls. */
  tableTab?: 'Table' | 'Phase';
}>;

/**
 * What a Stage changes in the header and the panel.
 * The fixture has no Stage and keeps its full Table tab.
 * Play keeps the turn and phase in the header and names that tab Phase.
 * A finished game shows its word but keeps the Phase tab, where its playback lives.
 * Every other stage shows its word in the header and brings its own tabs.
 */
function stageFrame(stage: GameSnapshot['stage']): StageFrame {
  switch (stage) {
    case undefined:
      return { tableTab: 'Table' };
    case 'play':
      return { tableTab: 'Phase' };
    case 'drafting':
      return { word: 'Drafting' };
    case 'swapping':
      return { word: 'Swapping' };
    case 'setup':
      return { word: 'Setup' };
    case 'finished':
      return { word: 'Finished', tableTab: 'Phase' };
    case 'discarded':
      return { word: 'Discarded' };
  }
}

/**
 * The controls panel in the accepted shape (#1147): one rail of tabs beside the content they open.
 * The host's tabs come first;
 * the fixture's own trackers, selected piece and storm controls are the last tab.
 * The per-player tabs are the host's `playerPanel`, in the pane beside this one.
 */
function TableControlsPanel({
  panelTabs = [],
  focusTab = null,
  tableControls,
  showStormControls,
  word,
  tableTab: tableTabLabel,
  panelContent,
}: Readonly<
  Pick<GameTableProps, 'panelTabs' | 'focusTab' | 'tableControls' | 'showStormControls' | 'panelContent'> & StageFrame
>) {
  const tableTab: PanelTab = {
    key: 'table',
    label: tableTabLabel ?? 'Table',
    topic: 'controls',
    content: (
      <>
        {tableControls}
        {tableTabLabel === 'Table' && <SpiceBankControls />}
        {tableTabLabel === 'Table' && <SelectedPieceControl />}
        {showStormControls && <StormControls helpOnly={tableTabLabel === 'Phase'} />}
      </>
    ),
  };
  const tabs: readonly PanelTab[] = panelContent
    ? [
        /* The stage panel is the drafting panel, whose row dividers meet the pane's sides. */
        { key: 'stage', label: word ?? 'Game', topic: 'controls', content: panelContent, padding: false },
        ...panelTabs,
      ]
    : [...panelTabs, ...(tableTabLabel ? [tableTab] : [])];
  const [path, setPath] = useReducer((_: string[], next: string[]) => next, [tabs[0]?.key ?? tableTab.key]);
  /* The stage tab arriving opens it over the chosen tab, so a spectator seated during drafting lands on the stage, not on the Log they watched from (#1666). The chosen tab is kept beneath: once the stage leaves, as in playback stepping into play, it opens again. */
  const hasStage = Boolean(panelContent);
  const [stageShown, setStageShown] = useState(hasStage);
  const [stageOpened, setStageOpened] = useState(false);
  if (hasStage !== stageShown) {
    setStageShown(hasStage);
    setStageOpened(hasStage);
  }
  /* The stage tab is opened as that overlay too, so tapping it never loses the tab beneath. */
  const choose = (next: string[]) => {
    const stage = hasStage && next[0] === 'stage';
    setStageOpened(stage);
    if (!stage) {
      setPath(next);
    }
  };
  /* Each focus token opens its tab once, during render as React adjusts state from a changed prop. */
  const [focused, setFocused] = useState<string | null>(null);
  if (focusTab && focusTab.token !== focused && tabs.some((tab) => tab.key === focusTab.key)) {
    setFocused(focusTab.token);
    choose([focusTab.key]);
  }
  const chosen = stageOpened ? undefined : tabs.find((tab) => tab.key === path[0]);
  const active = chosen ?? tabs[0] ?? tableTab;
  const subtab = (chosen && active.subtabs?.find((tab) => tab.key === path[1])) ?? active.subtabs?.[0];
  if (panelContent && panelTabs.length === 0) {
    return <div className="seated-stage-panel">{panelContent}</div>;
  }
  /* Before play there is nothing to step, select or place, and each earlier stage brings its own accepted panel with its delivery; until then the decision bar stands alone. */
  if (tabs.length === 0) {
    return null;
  }
  return (
    <NestedTabs
      activePath={subtab ? [active.key, subtab.key] : [active.key]}
      ariaLabel="Table controls"
      className="seated-controls-tabs"
    >
      <NestedTabs.Level label="Controls">
        {tabs.map((tab) => (
          <NestedTabs.Item
            key={tab.key}
            as="button"
            type="button"
            path={[tab.key]}
            label={tab.label}
            icon={<TopicIcon topic={tab.topic} size={22} />}
            onClick={() => choose([tab.key])}
          />
        ))}
      </NestedTabs.Level>
      {active.subtabs && (
        <NestedTabs.Level label={active.label}>
          {active.subtabs.map((tab) => (
            <NestedTabs.Item
              key={tab.key}
              as="button"
              type="button"
              path={[active.key, tab.key]}
              label={tab.label}
              icon={<TopicIcon topic={tab.topic} size={22} />}
              onClick={() => choose([active.key, tab.key])}
            />
          ))}
        </NestedTabs.Level>
      )}
      {/* No label of its own: the panel is the tabs' tabpanel, which NestedTabs names after the selected tab, and the sections inside stay the regions. */}
      <NestedTabs.ContentPanel className="seated-controls-tab-content" padding={(subtab ?? active).padding}>
        <Stack gap="lg">{subtab?.content ?? active.content}</Stack>
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

/** The two dock panes share a movable divider; each pane owns its own tabs and scroll position. */
function PanelPanes({ children, secondary }: Readonly<{ children: ReactNode; secondary?: ReactNode }>) {
  if (!secondary) {
    return children;
  }
  return (
    <SplitPanels
      orientation="vertical"
      defaultSize={50}
      limits={paneLimits}
      step={KEYBOARD_STEP_PERCENT}
      pageStep={KEYBOARD_PAGE_STEP_PERCENT}
      label="Resize the two panes"
    >
      <SplitPanels.First>{children}</SplitPanels.First>
      <SplitPanels.Second>{secondary}</SplitPanels.Second>
    </SplitPanels>
  );
}

function SpiceBankControls() {
  const { canHandleTable, spawnSpice, state } = useTabletop();
  return (
    <Section
      title="Spice Bank"
      description="Hover the Spice Bank disc left of the turn wheel and press 1 through 9, or 0 for ten. Drop spice onto the disc to return it to the Spice Bank."
    >
      <Group gap="xs" role="group" aria-label="Spawn spice">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
          <Button
            key={count}
            variant="default"
            size="compact-sm"
            disabled={!canHandleTable || !!state.draftMove}
            aria-label={`Spawn ${count} spice`}
            onClick={() => spawnSpice(count)}
          >
            {count}
          </Button>
        ))}
      </Group>
    </Section>
  );
}

/* The overlays a held modifier shows: Alt the stack counts, Control each piece's name and owner. A lost window or hidden page lets go of both. */
function useHeldOverlays() {
  const [held, setHeld] = useState({ counts: false, names: false });

  useEffect(() => {
    const sync = (event: KeyboardEvent | PointerEvent) =>
      setHeld((current) =>
        current.counts === event.altKey && current.names === event.ctrlKey
          ? current
          : { counts: event.altKey, names: event.ctrlKey }
      );
    const clear = () =>
      setHeld((current) => (current.counts || current.names ? { counts: false, names: false } : current));
    const visibilityChanged = () => {
      if (document.hidden) {
        clear();
      }
    };
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('pointermove', sync);
    window.addEventListener('pointerdown', sync);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('pointermove', sync);
      window.removeEventListener('pointerdown', sync);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);

  return held;
}

/* Hands the keyboard owner the live table on every render and binds it to the window once. */
function useTableKeyboardBinding(keyboard: TableKeyboard) {
  const table = useTabletop();
  const live = useRef(table);
  useLayoutEffect(() => {
    live.current = table;
  });
  useLayoutEffect(() => keyboard.bind({ events: window, read: () => live.current }), [keyboard]);
}

function controlsPanelValueText(percent: number) {
  return `${Math.round(percent)}% of the window for controls`;
}

export function GameTable({
  sceneContent,
  panelTabs,
  focusTab,
  tableControls,
  decisionBar,
  gameMenu,
  stageStatus,
  stage,
  mapVisible,
  stageOverlay,
  panelContent,
  playerPanel,
  toolbarControl,
  connectionStatus,
  showStormControls,
  seatCount,
  tableProgress,
  requestedView,
}: GameTableProps) {
  const [pointerSession] = useState(() => new PointerSession());
  const [tableKeyboard] = useState(() => new TableKeyboard());
  useTableKeyboardBinding(tableKeyboard);
  const { gestureActivePieceId } = useTabletop();
  const phaseSymbolClipId = useId();
  const heldOverlays = useHeldOverlays();
  const frame = stageFrame(stage);
  /* The camera follows the phase while the header names one: in play, and on the fixture. */
  /* A faction phase takes the camera view of the standard phase it precedes (#1138). */
  const activeEntry = tableProgress.phases.find((entry) => entry.id === tableProgress.activePhaseId);
  const viewPhase = frame.word || !activeEntry ? null : standardPhaseOf(activeEntry);
  const [viewState, dispatchView] = useReducer(reduceTableView, viewPhase, createTableViewState);
  if (viewState.phase !== viewPhase) {
    /* The phase changed since the last render; the reducer answers it before this render commits. */
    dispatchView({ type: 'phase.changed', phase: viewPhase });
  }
  const overlaysInert = viewState.interactionActive || gestureActivePieceId !== null;
  const cameraView = useMemo<CameraViewCommand>(
    () => ({
      view: viewState.activeView,
      revision: viewState.cameraRevision,
    }),
    [viewState.activeView, viewState.cameraRevision]
  );
  const activePhaseIndex = tableProgress.phases.findIndex((phase) => phase.id === tableProgress.activePhaseId);
  const activePhase = tableProgress.phases[activePhaseIndex];

  /* A request already standing when the table mounts was answered by an earlier mount, so only a later revision moves the camera. */
  const answeredRevision = useRef(requestedView?.revision);
  const requestedRevision = requestedView?.revision;
  const requestedTableView = requestedView?.view;
  useEffect(() => {
    if (requestedTableView && requestedRevision !== answeredRevision.current) {
      answeredRevision.current = requestedRevision;
      dispatchView({ type: 'view.selected', view: requestedTableView });
    }
  }, [requestedRevision, requestedTableView]);

  const handleInteractionActiveChange = useCallback((active: boolean) => {
    dispatchView({ type: 'interaction.changed', active });
  }, []);
  const handleSceneReady = useCallback(() => dispatchView({ type: 'scene.ready' }), []);
  /* A renderer whose initialisation never settles (the story runner's headless one is such a renderer) must not keep the shell closed for good: the clock reports for it, and a later real report changes nothing. */
  useEffect(() => {
    const timer = setTimeout(handleSceneReady, SCENE_READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [handleSceneReady]);

  return (
    <PointerSessionContext value={pointerSession}>
      <DarkSchemeIsland>
        {/* The stage stacks the waiting frame under the shell until the renderer is ready; then the frame goes and the shell opens through its iris. */}
        <div className="dune-play-stage" data-scene-ready={viewState.sceneReady}>
          {viewState.sceneReady ? null : <TableWait status="Opening the table..." />}
          <div
            className="dune-play-shell dune-play-shell--seated"
            {...darkSchemeIslandAttributes}
            data-board-gesture-active={overlaysInert}
            data-table-view={viewState.activeView}
            data-show-counts={heldOverlays.counts}
            data-show-names={heldOverlays.names}
          >
            {/* The header sits outside the split, in the shell's own stacking, so it paints above the dock where the dock's floor grows up over the scene. It comes before the split so its controls lead the reading and Tab order. */}
            <header className="seated-header" inert={overlaysInert} data-hides-cursor>
              <div className="seated-brand">
                <img className="seated-brand__logo" src="/web/logo.svg" alt="Dune" />
                {connectionStatus}
              </div>

              <div className="seated-phase-status" aria-live="polite">
                {activePhase?.symbol && !frame.word ? (
                  <svg className="seated-phase-status__symbol" viewBox="0 0 100 100" aria-hidden="true">
                    <defs>
                      <clipPath id={phaseSymbolClipId}>
                        <circle cx="50" cy="50" r={50 * PHASE_SYMBOL_MAX_RADIUS} />
                      </clipPath>
                    </defs>
                    <circle cx="50" cy="50" r="50" fill={PHASE_DISC_COLOR} />
                    <circle
                      cx="50"
                      cy="50"
                      r={25 * (PHASE_RING_OUTER_RADIUS + PHASE_RING_INNER_RADIUS)}
                      fill="none"
                      stroke={PHASE_INK_COLOR}
                      strokeWidth={50 * (PHASE_RING_OUTER_RADIUS - PHASE_RING_INNER_RADIUS)}
                    />
                    <g clipPath={`url(#${phaseSymbolClipId})`}>
                      <use
                        href={`${activePhase.symbol}#root`}
                        x={50 * (1 - PHASE_SYMBOL_MAX_RADIUS)}
                        y={50 * (1 - PHASE_SYMBOL_MAX_RADIUS)}
                        width={100 * PHASE_SYMBOL_MAX_RADIUS}
                        height={100 * PHASE_SYMBOL_MAX_RADIUS}
                        fill={PHASE_INK_COLOR}
                      />
                    </g>
                  </svg>
                ) : null}
                {stageStatus ??
                  (frame.word ? (
                    <div className="seated-phase-status__copy">
                      <strong>{frame.word}</strong>
                    </div>
                  ) : (
                    <div className="seated-phase-status__copy">
                      <span>Turn {tableProgress.turn}</span>
                      <strong>{activePhase?.label ?? 'No active phase'}</strong>
                    </div>
                  ))}
              </div>

              <div className="seated-toolbar">
                <TableViewPicker
                  activeView={viewState.activeView}
                  preferredView={viewPhase === null ? undefined : PHASE_VIEWS[viewPhase]}
                  onSelect={(view) => dispatchView({ type: 'view.selected', view })}
                />
                {gameMenu}
                {toolbarControl}
              </div>
            </header>

            <SplitPanels
              orientation="horizontal"
              primary="second"
              defaultSize={DEFAULT_CONTROLS_PANEL_PERCENT}
              limits={controlsPanelLimits}
              step={KEYBOARD_STEP_PERCENT}
              pageStep={KEYBOARD_PAGE_STEP_PERCENT}
              label="Resize controls panel"
              valueText={controlsPanelValueText}
            >
              <SplitPanels.First>
                <TableKeyboardContext value={tableKeyboard}>
                  <TabletopScene
                    className="scene scene--immersive"
                    cameraView={cameraView}
                    onSceneReady={handleSceneReady}
                    onInteractionActiveChange={handleInteractionActiveChange}
                    seatCount={seatCount}
                    tableProgress={tableProgress}
                    stage={stage}
                    mapVisible={mapVisible}
                  >
                    {sceneContent}
                  </TabletopScene>
                </TableKeyboardContext>

                {stageOverlay && (
                  <div className="seated-stage-overlay" inert={overlaysInert}>
                    {stageOverlay}
                  </div>
                )}
              </SplitPanels.First>
              <SplitPanels.Second>
                <div className="seated-controls-panel" inert={overlaysInert}>
                  {decisionBar}
                  <PanelPanes secondary={playerPanel}>
                    <TableControlsPanel
                      panelTabs={panelTabs}
                      focusTab={focusTab}
                      tableControls={tableControls}
                      panelContent={panelContent}
                      word={frame.word}
                      tableTab={frame.tableTab}
                      showStormControls={showStormControls}
                    />
                  </PanelPanes>
                </div>
              </SplitPanels.Second>
            </SplitPanels>
          </div>
        </div>
      </DarkSchemeIsland>
    </PointerSessionContext>
  );
}
