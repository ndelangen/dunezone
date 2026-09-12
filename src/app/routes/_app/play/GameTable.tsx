import { TABLE_PHASES } from '@shared/play/phases';
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

type GameTableProps = {
  sessionControl?: ReactNode;
  /* PROTOTYPE (#1142, #1145): an overlay over the scene, a replacement for the controls panel content, and a replacement for the header's centre block. */
  overlay?: ReactNode;
  panelContent?: ReactNode;
  headerCentre?: ReactNode;
  headerRight?: ReactNode;
  sceneExtras?: ReactNode;
  hidePieces?: boolean;
  showStormControls?: boolean;
  seatCount: TableSeatCount;
  phaseViewRequest?: PhaseViewRequest | null;
  tableProgress?: TableProgress;
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

function SelectedPieceHeading({ piece }: { piece: TablePiece | null }) {
  const selectedCount = piece ? pieceCount(piece) : 0;
  const selectedUnit = piece?.kind === 'card' ? 'card' : 'token';
  return (
    <h3 id="selected-piece-heading">
      {piece?.label ?? 'Select a card or token'}
      {piece ? (
        <span className="selected-piece-control__count">
          {selectedCount} {selectedUnit}
          {selectedCount === 1 ? '' : 's'}
        </span>
      ) : null}
    </h3>
  );
}

function SelectedPieceControl() {
  const table = useTabletop();
  const { canInteract } = usePresence();
  const control = selectedFlipControl(table);
  return (
    <section className="selected-piece-control" aria-labelledby="selected-piece-heading">
      <div className="selected-piece-control__copy">
        <span className="eyebrow">Selected piece</span>
        <SelectedPieceHeading piece={control.piece} />
        <p id="selected-piece-flip-help">{control.help}</p>
      </div>
      <button
        type="button"
        className="button button--quiet selected-piece-control__flip"
        aria-describedby="selected-piece-flip-help"
        aria-busy={control.isFlipping}
        disabled={control.disabled || !canInteract}
        onClick={() => table.flipSelected()}
      >
        {control.label}
      </button>
    </section>
  );
}

function StormControls() {
  const { moveStormBy, state } = useTabletop();
  const { canInteract } = usePresence();
  return (
    <section className="storm-debug-control" aria-labelledby="storm-debug-heading">
      <div className="storm-debug-control__copy">
        <span className="eyebrow">Debug</span>
        <h3 id="storm-debug-heading">Storm sector</h3>
        <p>Advance the highlighted sector counter-clockwise around Arrakis.</p>
      </div>
      <div className="storm-debug-control__actions">
        <button type="button" className="button button--quiet" disabled={!canInteract} onClick={() => moveStormBy(-1)}>
          Back one
        </button>
        <output className="storm-sector-readout" aria-live="polite">
          <strong>Sector {state.stormSectorIndex + 1}</strong>
          <span>of {TABLE_SECTOR_COUNT}</span>
        </output>
        <button type="button" className="button button--primary" disabled={!canInteract} onClick={() => moveStormBy(1)}>
          Advance one
        </button>
      </div>
    </section>
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

function TableControlsPanel({
  sessionControl,
  showStormControls,
  turn,
  onSelectTurn,
}: Readonly<Pick<GameTableProps, 'sessionControl' | 'showStormControls' | 'onSelectTurn'> & { turn: number }>) {
  return (
    <div className="seated-controls-panel__content">
      <header className="seated-controls-panel__header">
        <div>
          <span className="eyebrow">Table controls</span>
          <h2>Controls</h2>
        </div>
        <span className="seated-controls-panel__mode">Debug</span>
      </header>

      {sessionControl}
      <TrackerControls turn={turn} onSelectTurn={onSelectTurn} />
      <SelectedPieceControl />

      {showStormControls && <StormControls />}
    </div>
  );
}

function TrackerControls({ turn, onSelectTurn }: Readonly<{ turn: number; onSelectTurn?: (turn: number) => void }>) {
  const { spawnSpice, state } = useTabletop();
  const { canInteract } = usePresence();
  return (
    <section className="storm-debug-control" aria-label="Turn tracker and spice supply">
      <div className="storm-debug-control__copy">
        <span className="eyebrow">Table trackers</span>
        <h3>Turn {turn}</h3>
        <p>
          Select a number on the turn wheel. This changes the turn only, without moving pieces or changing the phase.
        </p>
        <div className="storm-debug-control__actions">
          <button
            type="button"
            className="button button--quiet"
            disabled={!canInteract || turn <= 1}
            onClick={() => onSelectTurn?.(turn - 1)}
          >
            Previous turn
          </button>
          <button
            type="button"
            className="button button--quiet"
            disabled={!canInteract}
            onClick={() => onSelectTurn?.(turn + 1)}
          >
            Next turn
          </button>
        </div>
        <h3>Spice supply</h3>
        <p>
          Hover the spice disc left of the turn wheel and press 1 through 9, or 0 for ten. Drop spice onto the disc to
          delete it.
        </p>
        <div className="spice-supply-amounts" role="group" aria-label="Spawn spice">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
            <button
              key={count}
              type="button"
              className="button button--quiet"
              disabled={!canInteract || !!state.draftMove}
              aria-label={`Spawn ${count} spice`}
              onClick={() => spawnSpice(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>
    </section>
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
  sessionControl,
  overlay,
  panelContent,
  headerCentre,
  headerRight,
  sceneExtras,
  hidePieces,
  showStormControls = true,
  seatCount,
  phaseViewRequest,
  tableProgress: providedProgress,
  onSelectTurn: selectSharedTurn,
}: GameTableProps) {
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
    <div
      ref={shellRef}
      className="dune-play-shell dune-play-shell--seated"
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
        extras={sceneExtras}
        hidePieces={hidePieces}
      />

      <header className="seated-header" inert={surfacePolicy.overlaysInert}>
        <div className="seated-brand">
          <img className="seated-brand__logo" src="/web/logo.svg" alt="Dune" />
        </div>

        {headerCentre ?? (
        <div className="seated-phase-status" aria-live="polite">
          {activePhase?.symbol ? (
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
            <span>Turn {tableProgress.turn}</span>
            <strong>{activePhase?.label ?? 'No active phase'}</strong>
          </div>
        </div>
        )}

        <div className="seated-toolbar">
          {headerRight}
          <TableViewPicker
            activeView={viewState.activeView}
            preferredView={resolvedPhaseViewRequest?.view}
            onSelect={(view) => dispatchView({ type: 'view.selected', view })}
          />
        </div>
      </header>

      {overlay ? (
        <div className="drafting-overlay-host" inert={surfacePolicy.overlaysInert}>
          {overlay}
        </div>
      ) : null}

      <ControlsPanelResizer panel={panel} inert={surfacePolicy.overlaysInert} />

      <aside
        id="table-controls-panel"
        className="seated-controls-panel"
        aria-label="Table controls"
        inert={surfacePolicy.overlaysInert}
      >
        {panelContent ?? (
          <TableControlsPanel
            sessionControl={sessionControl}
            showStormControls={showStormControls}
            turn={tableProgress.turn}
            onSelectTurn={onSelectTurn}
          />
        )}
      </aside>
    </div>
  );
}
