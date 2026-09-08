import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

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
import { createTableViewState, reduceTableView, TABLE_VIEW_OPTIONS } from './playView';
import type { CameraViewCommand, PhaseViewRequest, TableView } from './playView';
import { isTableSeatCount, TABLE_SECTOR_COUNT, TABLE_SEAT_COUNTS } from './tableSettings';
import type { TableSeatCount } from './tableSettings';
import { useTabletop } from './TabletopContext';
import { TabletopScene } from './TabletopScene';
import type { TableProgress } from './tableTrackers';

type LocalTablePhase = TableProgress['phases'][number] & {
  preferredView: TableView;
};

const DEFAULT_TABLE_PHASES: readonly LocalTablePhase[] = [
  { id: 'storm', label: 'Storm', preferredView: 'map' },
  { id: 'spice-blow', label: 'Spice blow', preferredView: 'right' },
  { id: 'choam-charity', label: 'CHOAM charity', preferredView: 'bottom' },
  { id: 'bidding', label: 'Bidding', preferredView: 'left' },
  { id: 'revival', label: 'Revival', preferredView: 'bottom' },
  {
    id: 'shipment-and-movement',
    label: 'Shipment and movement',
    preferredView: 'map',
  },
  { id: 'battle', label: 'Battle', preferredView: 'map' },
  { id: 'spice-collection', label: 'Spice collection', preferredView: 'map' },
  { id: 'mentat-pause', label: 'Mentat pause', preferredView: 'bottom' },
];

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

function TableControls() {
  return (
    <div className="table-controls">
      <div className="table-controls__grid">
        <kbd>Alt</kbd>
        <span>Show stack and deck counts</span>
        <kbd>Quick drag</kbd>
        <span>Peel the top item</span>
        <kbd>Hold + drag</kbd>
        <span>Move the whole stack</span>
        <kbd>T / RMB</kbd>
        <span>Take another item while holding</span>
        <kbd>Map / Left / Right / Bottom</kbd>
        <span>Change the table view</span>
        <kbd>Q / E</kbd>
        <span>Rotate 15 degrees</span>
        <kbd>F</kbd>
        <span>Flip a card, token, or whole stack</span>
        <kbd>L</kbd>
        <span>Lock or unlock</span>
        <kbd>G</kbd>
        <span>Stack nearby matches</span>
        <kbd>Hold 1-9</kbd>
        <span>Draw from a stack or deck</span>
        <kbd>Esc</kbd>
        <span>Cancel a held move</span>
      </div>
      <p>Drop matching forces or cards on each other to combine them.</p>
      <p>Hover a piece or select it, then press F to flip it. A deck or stack flips as one object.</p>
    </div>
  );
}

type GameTableProps = {
  seatCount: TableSeatCount;
  onSeatCountChange(nextSeatCount: TableSeatCount): void;
  phaseViewRequest?: PhaseViewRequest | null;
  tableProgress?: TableProgress;
};

type SeatedShellStyle = CSSProperties & {
  '--seated-controls-size': string;
};

function TableControlsPanel() {
  const { affordances, flipSelected, flippingPieceIds, gestureActivePieceId, moveStormBy, selectedPiece, state } =
    useTabletop();
  const flip = affordances.find((affordance) => affordance.commandType === 'piece.flip');
  const selectedFlippablePiece =
    selectedPiece?.kind === 'card' || selectedPiece?.kind === 'force' ? selectedPiece : null;
  const selectedCount = selectedFlippablePiece ? pieceCount(selectedFlippablePiece) : 0;
  const selectedUnit = selectedFlippablePiece?.kind === 'card' ? 'card' : 'token';
  const hasHeldMove = state.draftMove !== null || gestureActivePieceId !== null;
  const isFlipping = selectedFlippablePiece !== null && flippingPieceIds.has(selectedFlippablePiece.id);
  const flipUnavailable = !selectedFlippablePiece || !flip || hasHeldMove || isFlipping;
  const flipHelp = isFlipping
    ? 'Wait for this flip to finish.'
    : hasHeldMove
      ? 'Place or cancel the held piece before flipping.'
      : selectedFlippablePiece?.locked
        ? 'Unlock this piece before flipping.'
        : selectedFlippablePiece && !flip
          ? 'This piece cannot be flipped with the current permissions.'
          : selectedCount > 1
            ? 'Flips the whole stack. Hover it and press F to use the shortcut.'
            : 'Hover a card or token and press F to flip it.';

  return (
    <div className="seated-controls-panel__content">
      <header className="seated-controls-panel__header">
        <div>
          <span className="eyebrow">Table controls</span>
          <h2>Controls</h2>
        </div>
        <span className="seated-controls-panel__mode">Debug</span>
      </header>

      <section className="selected-piece-control" aria-labelledby="selected-piece-heading">
        <div className="selected-piece-control__copy">
          <span className="eyebrow">Selected piece</span>
          <h3 id="selected-piece-heading">
            {selectedFlippablePiece?.label ?? 'Select a card or token'}
            {selectedFlippablePiece ? (
              <span className="selected-piece-control__count">
                {selectedCount} {selectedUnit}
                {selectedCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </h3>
          <p id="selected-piece-flip-help">{flipHelp}</p>
        </div>
        <button
          type="button"
          className="button button--quiet selected-piece-control__flip"
          aria-describedby="selected-piece-flip-help"
          aria-busy={isFlipping}
          disabled={flipUnavailable}
          onClick={() => flipSelected()}
        >
          {flip?.label ?? 'Flip'}
        </button>
      </section>

      <section className="storm-debug-control" aria-labelledby="storm-debug-heading">
        <div className="storm-debug-control__copy">
          <span className="eyebrow">Debug</span>
          <h3 id="storm-debug-heading">Storm sector</h3>
          <p>Advance the highlighted sector counter-clockwise around Arrakis.</p>
        </div>
        <div className="storm-debug-control__actions">
          <button type="button" className="button button--quiet" onClick={() => moveStormBy(-1)}>
            Back one
          </button>
          <output className="storm-sector-readout" aria-live="polite">
            <strong>Sector {state.stormSectorIndex + 1}</strong>
            <span>of {TABLE_SECTOR_COUNT}</span>
          </output>
          <button type="button" className="button button--primary" onClick={() => moveStormBy(1)}>
            Advance one
          </button>
        </div>
      </section>
    </div>
  );
}

export function GameTable({
  seatCount,
  onSeatCountChange,
  phaseViewRequest,
  tableProgress = DEFAULT_TABLE_PROGRESS,
}: GameTableProps) {
  const { gestureActivePieceId } = useTabletop();
  const shellRef = useRef<HTMLDivElement>(null);
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
  const dividerPointerId = useRef<number | null>(null);
  const [controlsPanelPercent, setControlsPanelPercent] = useState(DEFAULT_CONTROLS_PANEL_PERCENT);
  const [maxControlsPanelPercent, setMaxControlsPanelPercent] = useState(MAX_CONTROLS_PANEL_PERCENT);
  const [controlsPanelResizing, setControlsPanelResizing] = useState(false);
  const resolvedPhaseViewRequest =
    phaseViewRequest === undefined
      ? tableProgress === DEFAULT_TABLE_PROGRESS
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

  const updateSeatCount = (nextCount: number) => {
    if (isTableSeatCount(nextCount)) {
      onSeatCountChange(nextCount);
    }
  };

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
    [maxControlsPanelPercent]
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
  }, []);

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

  const shellStyle: SeatedShellStyle = {
    '--seated-controls-size': `${controlsPanelPercent}%`,
  };

  return (
    <div
      ref={shellRef}
      className="dune-play-shell dune-play-shell--seated"
      data-board-gesture-active={surfacePolicy.overlaysInert}
      data-controls-resizing={controlsPanelResizing}
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
      />

      <header className="seated-header" inert={surfacePolicy.overlaysInert}>
        <div className="seated-brand">
          <span className="seated-brand__name">Dune Play</span>
        </div>

        <div className="seated-phase-status" aria-live="polite">
          <span>Turn {tableProgress.turn}</span>
          <strong>{activePhase?.label ?? 'No active phase'}</strong>
          <span>
            {activePhase
              ? `Phase ${activePhaseIndex + 1} of ${tableProgress.phases.length}`
              : `${tableProgress.phases.length} phases`}
          </span>
        </div>

        <div className="seated-toolbar">
          <div className="table-view-picker" role="group" aria-label="Table view">
            {TABLE_VIEW_OPTIONS.map((view) => {
              const phasePreferred = resolvedPhaseViewRequest?.view === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  className={viewState.activeView === view.id ? 'is-active' : ''}
                  aria-label={`Focus on ${view.label.toLowerCase()}${
                    phasePreferred ? ', recommended for this phase' : ''
                  }`}
                  aria-pressed={viewState.activeView === view.id}
                  data-phase-preferred={phasePreferred || undefined}
                  onClick={() => dispatchView({ type: 'view.selected', view: view.id })}
                >
                  {view.label}
                  {phasePreferred ? <span className="phase-view-dot" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="button button--quiet table-view-center"
            aria-label="Recenter current view"
            onClick={() => dispatchView({ type: 'view.reset' })}
          >
            Center
          </button>

          <details className="toolbar-menu toolbar-menu--help" name="table-toolbar-menu">
            <summary>Help</summary>
            <div className="toolbar-popover">
              <TableControls />
            </div>
          </details>

          <details className="toolbar-menu toolbar-menu--setup" name="table-toolbar-menu">
            <summary>Setup</summary>
            <div className="toolbar-popover setup-controls">
              <label className="seat-count-control">
                <span>Seats</span>
                <select
                  aria-label="Number of player seats"
                  value={seatCount}
                  onChange={(event) => updateSeatCount(Number(event.target.value))}
                >
                  {TABLE_SEAT_COUNTS.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </div>
      </header>

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
        inert={surfacePolicy.overlaysInert}
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
        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (event.button !== 0 || !event.isPrimary || dividerPointerId.current !== null) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          dividerPointerId.current = event.pointerId;
          setControlsPanelResizing(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeControlsPanelFromPointer(event.clientY);
        }}
        onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (dividerPointerId.current !== event.pointerId) {
            return;
          }
          event.preventDefault();
          resizeControlsPanelFromPointer(event.clientY);
        }}
        onPointerUp={finishControlsPanelResize}
        onPointerCancel={finishControlsPanelResize}
        onLostPointerCapture={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (dividerPointerId.current === event.pointerId) {
            dividerPointerId.current = null;
            setControlsPanelResizing(false);
          }
        }}
      >
        <span aria-hidden="true" />
      </div>

      <aside
        id="table-controls-panel"
        className="seated-controls-panel"
        aria-label="Table controls"
        inert={surfacePolicy.overlaysInert}
      >
        <TableControlsPanel />
      </aside>
    </div>
  );
}
