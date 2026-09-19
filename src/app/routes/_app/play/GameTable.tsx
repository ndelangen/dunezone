import { Button, Group, Stack, Text } from '@mantine/core';
import { TABLE_PHASES } from '@shared/play/phases';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type {
  RefObject,
  ReactNode,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

import {
  clampControlsPanelPercent,
  controlsPanelPercentForKey,
  controlsPanelPercentFromPointer,
  DEFAULT_CONTROLS_PANEL_PERCENT,
  MAX_CONTROLS_PANEL_PERCENT,
  maxControlsPanelPercentForHeight,
  MIN_CONTROLS_PANEL_PERCENT,
} from './controlPanelLayout';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import { interactionSurfacePolicy } from './interactionPolicy';
import { pieceCount } from './model';
import type { TablePiece } from './model';
import { usePresence } from './multiplayer/PresenceContext';
import {
  PHASE_DISC_COLOR,
  PHASE_INK_COLOR,
  PHASE_RING_INNER_RADIUS,
  PHASE_RING_OUTER_RADIUS,
  PHASE_SYMBOL_MAX_RADIUS,
} from './phaseSymbolLayout';
import { createTableViewState, reduceTableView, TABLE_VIEW_OPTIONS } from './playView';
import type { CameraViewCommand, PhaseViewRequest, TableView } from './playView';
import { PointerSession } from './PointerSession';
import { PointerSessionContext } from './PointerSessionContext';
import { TABLE_SECTOR_COUNT } from './tableSettings';
import type { TableSeatCount } from './tableSettings';
import { useTabletop } from './TabletopContext';
import type { TabletopContextValue } from './TabletopContext';
import { TabletopScene } from './TabletopScene';
import type { TableProgress } from './tableTrackers';

type LocalTablePhase = TableProgress['phases'][number] & {
  preferredView: TableView;
};

const DEFAULT_PHASE_VIEWS: Record<(typeof TABLE_PHASES)[number]['id'], TableView> = {
  storm: 'map',
  'spice-blow': 'right',
  'choam-charity': 'bottom',
  bidding: 'left',
  revival: 'bottom',
  'shipment-and-movement': 'map',
  battle: 'map',
  'spice-collection': 'map',
  'mentat-pause': 'bottom',
};

const DEFAULT_TABLE_PHASES: readonly LocalTablePhase[] = TABLE_PHASES.map((phase) => ({
  ...phase,
  preferredView: DEFAULT_PHASE_VIEWS[phase.id],
}));

const DEFAULT_TABLE_PROGRESS: TableProgress = {
  turn: 1,
  phases: DEFAULT_TABLE_PHASES,
  activePhaseId: 'shipment-and-movement',
};

const defaultActivePhase = DEFAULT_TABLE_PHASES.find((phase) => phase.id === DEFAULT_TABLE_PROGRESS.activePhaseId);

const DEFAULT_PHASE_VIEW_REQUEST: PhaseViewRequest | null = defaultActivePhase
  ? {
      id: `turn-${DEFAULT_TABLE_PROGRESS.turn}:${defaultActivePhase.id}`,
      view: defaultActivePhase.preferredView,
    }
  : null;

/** One tab of the controls panel: what it is called, its glyph from the topic map, and what it shows. */
type PanelTab = Readonly<{ key: string; label: string; topic: TopicIconTopic; content: ReactNode }>;

type GameTableProps = {
  sceneContent?: ReactNode;
  /** Tabs the host adds ahead of the fixture's own Table tab, in the accepted order. */
  panelTabs?: readonly PanelTab[];
  /** Sections the host adds to the Table tab, above the fixture's trackers. */
  tableControls?: ReactNode;
  /** The important decision of the moment, above the panel's tabs: a seat request, a vote, a result. */
  decisionBar?: ReactNode;
  /** The game menu in the toolbar, present in every stage: what a player can do about their own seat. Previous and Next stay rightmost. */
  gameMenu?: ReactNode;
  toolbarControl?: ReactNode;
  showStormControls?: boolean;
  seatCount: TableSeatCount;
  phaseViewRequest?: PhaseViewRequest | null;
  tableProgress?: TableProgress;
  /* A stage word for the header while the game is not in play; the turn and phase read only in play. */
  stageLabel?: string;
  onSelectTurn?(turn: number): void;
};

type SeatedShellStyle = CSSProperties & {
  '--seated-controls-size': string;
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
  const { canInteract } = usePresence();
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
          disabled={control.disabled || !canInteract}
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

function StormControls() {
  const { moveStormBy, state } = useTabletop();
  const { canInteract } = usePresence();
  return (
    <Section
      eyebrow="Debug"
      title="Storm sector"
      description="Advance the highlighted sector counter-clockwise around Arrakis."
    >
      <Group gap="sm">
        <Button variant="default" disabled={!canInteract} onClick={() => moveStormBy(-1)}>
          Back one
        </Button>
        <Text component="output" aria-live="polite">
          <strong>Sector {state.stormSectorIndex + 1}</strong> of {TABLE_SECTOR_COUNT}
        </Text>
        <Button disabled={!canInteract} onClick={() => moveStormBy(1)}>
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

/**
 * The controls panel in the accepted shape (#1147): one rail of tabs beside the content they open.
 * The host's tabs come first;
 * the fixture's own trackers, selected piece and storm controls are the last tab.
 * The per-player tabs of the accepted arrangement land with the first per-player content.
 */
function TableControlsPanel({
  panelTabs = [],
  tableControls,
  showStormControls,
  turn,
  onSelectTurn,
  stageLabel,
}: Readonly<
  Pick<GameTableProps, 'panelTabs' | 'tableControls' | 'showStormControls' | 'onSelectTurn' | 'stageLabel'> & {
    turn: number;
  }
>) {
  const tableTab: PanelTab = {
    key: 'table',
    label: 'Table',
    topic: 'controls',
    content: (
      <>
        {tableControls}
        <TrackerControls turn={turn} onSelectTurn={onSelectTurn} />
        <SelectedPieceControl />
        {showStormControls && <StormControls />}
      </>
    ),
  };
  const tabs = [...panelTabs, tableTab];
  const [activeKey, setActiveKey] = useState(tabs[0]?.key ?? tableTab.key);
  const active = tabs.find((tab) => tab.key === activeKey) ?? tableTab;
  /* Before play there is nothing to step, select or place, and each earlier stage brings its own accepted panel with its delivery; until then the decision bar stands alone. */
  if (stageLabel && panelTabs.length === 0) {
    return null;
  }
  return (
    <NestedTabs activePath={[active.key]} ariaLabel="Table controls" className="seated-controls-tabs">
      <NestedTabs.Level label="Controls">
        {tabs.map((tab) => (
          <NestedTabs.Item
            key={tab.key}
            as="button"
            type="button"
            path={[tab.key]}
            label={tab.label}
            icon={<TopicIcon topic={tab.topic} size={22} />}
            onClick={() => setActiveKey(tab.key)}
          />
        ))}
      </NestedTabs.Level>
      {/* Unnamed on purpose: the sections inside are the regions, and a second region with a section's own name would double it. */}
      <NestedTabs.ContentPanel className="seated-controls-tab-content">
        <Stack gap="lg">{active.content}</Stack>
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

function TrackerControls({ turn, onSelectTurn }: Readonly<{ turn: number; onSelectTurn?: (turn: number) => void }>) {
  const { spawnSpice, state } = useTabletop();
  const { canInteract } = usePresence();
  return (
    <>
      <Section
        eyebrow="Table trackers"
        title={`Turn ${turn}`}
        description="Select a number on the turn wheel. This changes the turn only, without moving pieces or changing the phase."
      >
        <Group gap="sm">
          <Button variant="default" disabled={!canInteract || turn <= 1} onClick={() => onSelectTurn?.(turn - 1)}>
            Previous turn
          </Button>
          <Button variant="default" disabled={!canInteract} onClick={() => onSelectTurn?.(turn + 1)}>
            Next turn
          </Button>
        </Group>
      </Section>
      <Section
        title="Spice supply"
        description="Hover the spice disc left of the turn wheel and press 1 through 9, or 0 for ten. Drop spice onto the disc to delete it."
      >
        <Group gap="xs" role="group" aria-label="Spawn spice">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
            <Button
              key={count}
              variant="default"
              size="compact-sm"
              disabled={!canInteract || !!state.draftMove}
              aria-label={`Spawn ${count} spice`}
              onClick={() => spawnSpice(count)}
            >
              {count}
            </Button>
          ))}
        </Group>
      </Section>
    </>
  );
}

function useStackCounts() {
  const [showCounts, setShowCounts] = useState(false);

  useEffect(() => {
    const syncAlt = (event: KeyboardEvent | PointerEvent) => setShowCounts(event.altKey);
    const clear = () => setShowCounts(false);
    const visibilityChanged = () => {
      if (document.hidden) {
        clear();
      }
    };
    window.addEventListener('keydown', syncAlt);
    window.addEventListener('keyup', syncAlt);
    window.addEventListener('pointermove', syncAlt);
    window.addEventListener('pointerdown', syncAlt);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      window.removeEventListener('keydown', syncAlt);
      window.removeEventListener('keyup', syncAlt);
      window.removeEventListener('pointermove', syncAlt);
      window.removeEventListener('pointerdown', syncAlt);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);

  return showCounts;
}

function useControlsPanelPointer(resizeControlsPanelFromPointer: (clientY: number) => void) {
  const dividerPointerId = useRef<number | null>(null);
  const [controlsPanelResizing, setControlsPanelResizing] = useState(false);
  const finishControlsPanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dividerPointerId.current !== event.pointerId) {
      return;
    }
    dividerPointerId.current = null;
    setControlsPanelResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return {
    controlsPanelResizing,
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      const primaryButton = event.button === 0 && event.isPrimary;
      if (!primaryButton) {
        return;
      }
      if (dividerPointerId.current !== null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dividerPointerId.current = event.pointerId;
      setControlsPanelResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeControlsPanelFromPointer(event.clientY);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dividerPointerId.current !== event.pointerId) {
        return;
      }
      event.preventDefault();
      resizeControlsPanelFromPointer(event.clientY);
    },
    onPointerUp: finishControlsPanelResize,
    onPointerCancel: finishControlsPanelResize,
    onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dividerPointerId.current === event.pointerId) {
        dividerPointerId.current = null;
        setControlsPanelResizing(false);
      }
    },
  };
}

function useControlsPanelResize(shellRef: RefObject<HTMLDivElement | null>) {
  const [controlsPanelPercent, setControlsPanelPercent] = useState(DEFAULT_CONTROLS_PANEL_PERCENT);
  const [maxControlsPanelPercent, setMaxControlsPanelPercent] = useState(MAX_CONTROLS_PANEL_PERCENT);
  const resizeControlsPanelFromPointer = useCallback(
    (clientY: number) => {
      const bounds = shellRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      setControlsPanelPercent(
        controlsPanelPercentFromPointer(clientY, bounds.top, bounds.height, maxControlsPanelPercent)
      );
    },
    [maxControlsPanelPercent, shellRef]
  );

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    const updatePanelLimit = () => {
      const nextMaximum = maxControlsPanelPercentForHeight(shell.getBoundingClientRect().height);
      setMaxControlsPanelPercent(nextMaximum);
      setControlsPanelPercent((current) => clampControlsPanelPercent(current, nextMaximum));
    };
    updatePanelLimit();
    const observer = new ResizeObserver(updatePanelLimit);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [shellRef]);

  const pointer = useControlsPanelPointer(resizeControlsPanelFromPointer);
  return { controlsPanelPercent, maxControlsPanelPercent, setControlsPanelPercent, ...pointer };
}

function ControlsPanelResizer({ panel, inert }: { panel: ReturnType<typeof useControlsPanelResize>; inert: boolean }) {
  const { controlsPanelPercent, maxControlsPanelPercent, setControlsPanelPercent } = panel;
  return (
    <div
      className="seated-controls-resizer"
      role="separator"
      aria-label="Resize controls panel"
      aria-orientation="horizontal"
      aria-controls="table-controls-panel"
      aria-valuemin={MIN_CONTROLS_PANEL_PERCENT}
      aria-valuemax={Number(maxControlsPanelPercent.toFixed(1))}
      aria-valuenow={Number(controlsPanelPercent.toFixed(1))}
      aria-valuetext={`${Math.round(controlsPanelPercent)}% of the window for controls`}
      inert={inert}
      tabIndex={0}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        event.stopPropagation();
        const nextPercent = controlsPanelPercentForKey(controlsPanelPercent, event.key, maxControlsPanelPercent);
        if (nextPercent === null) {
          return;
        }
        event.preventDefault();
        setControlsPanelPercent(nextPercent);
      }}
      onPointerDown={panel.onPointerDown}
      onPointerMove={panel.onPointerMove}
      onPointerUp={panel.onPointerUp}
      onPointerCancel={panel.onPointerCancel}
      onLostPointerCapture={panel.onLostPointerCapture}
    >
      <span aria-hidden="true" />
    </div>
  );
}

export function GameTable({
  sceneContent,
  panelTabs,
  tableControls,
  decisionBar,
  gameMenu,
  toolbarControl,
  showStormControls = true,
  seatCount,
  phaseViewRequest,
  tableProgress: providedProgress,
  stageLabel,
  onSelectTurn: selectSharedTurn,
}: GameTableProps) {
  const [pointerSession] = useState(() => new PointerSession());
  const [localTurn, setLocalTurn] = useState(DEFAULT_TABLE_PROGRESS.turn);
  const tableProgress = providedProgress ?? { ...DEFAULT_TABLE_PROGRESS, turn: localTurn };
  const onSelectTurn = selectSharedTurn ?? setLocalTurn;
  const { gestureActivePieceId } = useTabletop();
  const phaseSymbolClipId = useId();
  const shellRef = useRef<HTMLDivElement>(null);
  const showCounts = useStackCounts();
  const panel = useControlsPanelResize(shellRef);
  const resolvedPhaseViewRequest =
    phaseViewRequest === undefined
      ? providedProgress === undefined
        ? DEFAULT_PHASE_VIEW_REQUEST
        : null
      : phaseViewRequest;
  const [viewState, dispatchView] = useReducer(reduceTableView, createTableViewState(resolvedPhaseViewRequest));
  const surfacePolicy = interactionSurfacePolicy(true, gestureActivePieceId, viewState.interactionActive);
  const cameraView = useMemo<CameraViewCommand>(
    () => ({
      view: viewState.activeView,
      revision: viewState.cameraRevision,
    }),
    [viewState.activeView, viewState.cameraRevision]
  );
  const activePhaseIndex = tableProgress.phases.findIndex((phase) => phase.id === tableProgress.activePhaseId);
  const activePhase = tableProgress.phases[activePhaseIndex];

  useEffect(() => {
    if (resolvedPhaseViewRequest) {
      dispatchView({ type: 'phase.requested', request: resolvedPhaseViewRequest });
    } else {
      dispatchView({ type: 'phase.cleared' });
    }
  }, [resolvedPhaseViewRequest]);

  const handleInteractionActiveChange = useCallback((active: boolean) => {
    dispatchView({ type: 'interaction.changed', active });
  }, []);

  const shellStyle: SeatedShellStyle = {
    '--seated-controls-size': `${panel.controlsPanelPercent}%`,
  };

  return (
    <PointerSessionContext value={pointerSession}>
      <DarkSchemeIsland>
        <div
          ref={shellRef}
          className="dune-play-shell dune-play-shell--seated"
          {...darkSchemeIslandAttributes}
          data-board-gesture-active={surfacePolicy.overlaysInert}
          data-controls-resizing={panel.controlsPanelResizing}
          data-table-view={viewState.activeView}
          data-show-counts={showCounts}
          style={shellStyle}
        >
          <TabletopScene
            mode="seated"
            interaction="drag"
            className="scene scene--immersive"
            cameraView={cameraView}
            onInteractionActiveChange={handleInteractionActiveChange}
            seatCount={seatCount}
            tableProgress={tableProgress}
            onSelectTurn={onSelectTurn}
          >
            {sceneContent}
          </TabletopScene>

          <header className="seated-header" inert={surfacePolicy.overlaysInert}>
            <div className="seated-brand">
              <img className="seated-brand__logo" src="/web/logo.svg" alt="Dune" />
            </div>

            <div className="seated-phase-status" aria-live="polite">
              {activePhase?.symbol && !stageLabel ? (
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
              <div className="seated-phase-status__copy">
                {stageLabel ? (
                  <strong>{stageLabel}</strong>
                ) : (
                  <>
                    <span>Turn {tableProgress.turn}</span>
                    <strong>{activePhase?.label ?? 'No active phase'}</strong>
                  </>
                )}
              </div>
            </div>

            <div className="seated-toolbar">
              <TableViewPicker
                activeView={viewState.activeView}
                preferredView={resolvedPhaseViewRequest?.view}
                onSelect={(view) => dispatchView({ type: 'view.selected', view })}
              />
              {gameMenu}
              {toolbarControl}
            </div>
          </header>

          <ControlsPanelResizer panel={panel} inert={surfacePolicy.overlaysInert} />

          <div id="table-controls-panel" className="seated-controls-panel" inert={surfacePolicy.overlaysInert}>
            {decisionBar}
            <TableControlsPanel
              panelTabs={panelTabs}
              tableControls={tableControls}
              stageLabel={stageLabel}
              showStormControls={showStormControls}
              turn={tableProgress.turn}
              onSelectTurn={onSelectTurn}
            />
          </div>
        </div>
      </DarkSchemeIsland>
    </PointerSessionContext>
  );
}
