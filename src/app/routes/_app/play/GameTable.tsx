import { Button, Group, Text, Tooltip } from '@mantine/core';
import { turnCaption } from '@shared/play/lastTurn';
import { pieceCount } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { standardPhaseOf } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { TABLE_SECTOR_COUNT } from '@shared/play/tableSettings';
import type { TableSeatCount } from '@shared/play/tableSettings';
import { Section } from '@ui/block/Section';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from '@ui/surface/DarkSchemeIsland';
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import {
  PHASE_DISC_COLOR,
  PHASE_INK_COLOR,
  PHASE_RING_INNER_RADIUS,
  PHASE_RING_OUTER_RADIUS,
  PHASE_SYMBOL_MAX_RADIUS,
} from '../../../widgets/tabletop/phaseSymbolLayout';
import {
  createTableViewState,
  PHASE_VIEWS,
  reduceTableView,
  TABLE_VIEW_OPTIONS,
  TOP_VIEW,
} from '../../../widgets/tabletop/playView';
import type { CameraViewCommand, TableView } from '../../../widgets/tabletop/playView';
import { PointerSession } from '../../../widgets/tabletop/PointerSession';
import { PointerSessionContext } from '../../../widgets/tabletop/PointerSessionContext';
import { TableKeyboard } from '../../../widgets/tabletop/TableKeyboard';
import { TableKeyboardContext } from '../../../widgets/tabletop/TableKeyboardContext';
import {
  useTabletop,
  useTabletopCommands,
  useTabletopReader,
  useTabletopSelector,
} from '../../../widgets/tabletop/TabletopContext';
import type { TabletopContextValue } from '../../../widgets/tabletop/TabletopContext';
import { TabletopScene } from '../../../widgets/tabletop/TabletopScene';
import type { TableProgress } from '../../../widgets/tabletop/tableTrackers';
import { CompassControls } from './compass/CompassControls';
import { CompassTableContext } from './compass/compassTable';
import { MentatRecallBackdrop } from './multiplayer/MentatRecall';
import { TableLabelsContext } from './tableLabels';
import type { TableLabels } from './tableLabels';
import { TableWait } from './TableWait';

/* How long the shell waits for the renderer before opening anyway. */
const SCENE_READY_FALLBACK_MS = 1500;

/** One panel of the table's controls, which the compass opens as a window: its name, its glyph from the topic map, and what it shows. */
export type TablePanel = Readonly<{
  key: string;
  label: string;
  topic: TopicIconTopic;
  /** One line saying what the panel is for: the search's hint, and the first line behind the window's (?). */
  description?: string;
  /** The panel's full guidance, behind the window's (?) under the description. */
  help?: string;
  content: ReactNode;
  /** False when the content runs to the window's sides and insets its own text. */
  padding?: boolean;
  /** True when the content fills the window and scrolls its own parts, as the Battle plan does. */
  fill?: boolean;
  /** The content may peek over the window's top edge, as the Battle plan's cards do. */
  peek?: boolean;
  /** The window's own buttons in its title bar, such as the Battle plan's support mode. */
  actions?: ReactNode;
  /** A group's panels; the group itself opens nothing. */
  panels?: readonly TablePanel[];
}>;

type GameTableProps = {
  sceneContent?: ReactNode;
  readOnly?: boolean;
  /** The host's panels, grouped, ahead of the fixture's own Table panel. */
  panels?: readonly TablePanel[];
  /** A window to open once per token, as a battle opens on the viewer's side; the player can close it and it stays closed. */
  focus?: Readonly<{ key: string; token: string }> | null;
  /** Sections the host adds to the Table panel, above the fixture's trackers. */
  tableControls?: ReactNode;
  /** What the Table panel's (?) says about it: play's Phase panel explains the phase. */
  tableGuidance?: Pick<TablePanel, 'description' | 'help'>;
  /** The game menu in the toolbar, present in every stage: what a player can do about their own seat. Previous and Next stay rightmost. */
  gameMenu?: ReactNode;
  toolbarControl?: ReactNode;
  /** Connection recovery, centred above the table and separate from the phase. */
  connectionStatus?: ReactNode;
  /** Who is allied with whom, under the game's name beside the phase. */
  alliances?: ReactNode;
  showStormControls: boolean;
  seatCount: TableSeatCount;
  tableProgress: TableProgress;
  /* Absent on the fixture, which has no lifecycle. */
  stage?: GameSnapshot['stage'];
  mapVisible?: boolean;
  /* The header's centre during a stage that says more than its word: the drafting counts and status. */
  stageStatus?: ReactNode;
  /* The phase's turns beside its words, in play during Shipment and Movement: the factions' tokens in turn order. */
  phaseTurns?: ReactNode;
  /* Play chrome laid over the scene for a stage, under the header: the drafting ledger. */
  stageOverlay?: ReactNode;
  /* A stage's own panel, leading the Game group: the drafting panel. Its window is flush, so the content insets itself. */
  panelContent?: ReactNode;
  /* A view the host asks for after something the viewer did lands out of frame; each new revision moves the camera once. */
  requestedView?: Readonly<{ view: TableView; revision: number }>;
};

function flippableSelection(piece: TablePiece | null) {
  return piece?.kind === 'card' || piece?.kind === 'force' ? piece : null;
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
    help: selectedFlipHelp({
      piece,
      isFlipping,
      hasHeldMove,
      hasFlip: Boolean(flip),
    }),
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
          onClick={() => table.flipSelected(control.piece?.id)}
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

function StormControls({ hiddenHeading = false }: { hiddenHeading?: boolean }) {
  const canHandleTable = useTabletopSelector((table) => table.canHandleTable);
  const stormSectorIndex = useTabletopSelector((table) => table.state.stormSectorIndex);
  const { moveStormBy } = useTabletopCommands();
  return (
    <Section
      hiddenHeading={hiddenHeading}
      eyebrow="Debug"
      title="Storm sector"
      description="Advance the highlighted sector counter-clockwise around Arrakis."
    >
      <Group gap="sm">
        <Button variant="default" disabled={!canHandleTable} onClick={() => moveStormBy(-1)}>
          Back one
        </Button>
        <Text component="output" aria-live="polite">
          <strong>Sector {stormSectorIndex + 1}</strong> of {TABLE_SECTOR_COUNT}
        </Text>
        <Button disabled={!canHandleTable} onClick={() => moveStormBy(1)}>
          Advance one
        </Button>
      </Group>
    </Section>
  );
}

const DIAL_LETTERS: Record<TableView, string> = {
  map: 'M',
  left: 'L',
  right: 'R',
  bottom: 'B',
  top: 'U',
};

/* Where each view sits on the dial: the board at the top, the bays to the sides, the bottom stem below; the hub needs no needle. */
const DIAL_ANGLES: Record<TableView, number> = {
  map: 180,
  left: 90,
  right: 270,
  bottom: 0,
  top: 180,
};

/* The phase's disc in the header chip: the board's phase colours, with the phase symbol clipped to the disc. */
function PhaseDisc({ symbol }: Readonly<{ symbol: string }>) {
  const phaseSymbolClipId = useId();
  return (
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
          href={`${symbol}#root`}
          x={50 * (1 - PHASE_SYMBOL_MAX_RADIUS)}
          y={50 * (1 - PHASE_SYMBOL_MAX_RADIUS)}
          width={100 * PHASE_SYMBOL_MAX_RADIUS}
          height={100 * PHASE_SYMBOL_MAX_RADIUS}
          fill={PHASE_INK_COLOR}
        />
      </g>
    </svg>
  );
}

/* The header chip's words: a stage's own word, or the turn caption above the phase's name. */
function PhaseCopy({ word, caption, label }: Readonly<{ word?: string; caption: string; label?: string }>) {
  if (word) {
    return (
      <div className="seated-phase-status__copy">
        <strong>{word}</strong>
      </div>
    );
  }
  return (
    <div className="seated-phase-status__copy">
      <span>{caption}</span>
      <strong>{label ?? 'No active phase'}</strong>
    </div>
  );
}

/* The dial in the table's top right corner, under the toolbar; a slot pinned below it keeps clear of it. A stage overlay hides the table, and the dial with it. */
function SceneCamera({
  hidden,
  inert,
  ...dial
}: Readonly<{ hidden: boolean; inert: boolean } & Parameters<typeof TableViewDial>[0]>) {
  if (hidden) {
    return null;
  }
  return (
    <div className="seated-camera" data-hides-cursor inert={inert}>
      <TableViewDial {...dial} />
    </div>
  );
}

/*
 * The camera dial in the scene's corner: the needle points at the view the camera holds, a ring marks the phase's recommended view,
 * and each letter moves the camera there. The hub is the top-down view, straight down on the whole board; pressed again it returns.
 */
function TableViewDial({
  activeView,
  preferredView,
  onSelect,
}: {
  activeView: TableView;
  preferredView?: TableView;
  onSelect: (view: TableView) => void;
}) {
  return (
    <div className="camera-dial" role="group" aria-label="Table view" data-view={activeView}>
      <span className="camera-dial__needle" style={{ rotate: `${DIAL_ANGLES[activeView]}deg` }} aria-hidden="true" />
      <Tooltip label={`Camera: ${TOP_VIEW.label} (${DIAL_LETTERS.top})`}>
        <button
          type="button"
          className="camera-dial__hub"
          data-view={TOP_VIEW.id}
          aria-label="Focus on top, straight down"
          aria-pressed={activeView === TOP_VIEW.id}
          onClick={() => onSelect(TOP_VIEW.id)}
        >
          {DIAL_LETTERS.top}
        </button>
      </Tooltip>
      {TABLE_VIEW_OPTIONS.map((view) => {
        const phasePreferred = preferredView === view.id;
        return (
          <Tooltip key={view.id} label={`Camera: ${view.label}`}>
            <button
              type="button"
              className="camera-dial__view"
              data-view={view.id}
              aria-label={`Focus on ${view.label.toLowerCase()}${phasePreferred ? ', recommended for this phase' : ''}`}
              aria-pressed={activeView === view.id}
              data-phase-preferred={phasePreferred || undefined}
              onClick={() => onSelect(view.id)}
            >
              {DIAL_LETTERS[view.id]}
            </button>
          </Tooltip>
        );
      })}
      <span className="camera-dial__label" aria-hidden="true">
        Camera
      </span>
    </div>
  );
}

type StageFrame = Readonly<{
  /** The header's word in place of the turn and phase. */
  word?: string;
  /** The Game group's last stage panel: the fixture's full Table panel, or play's Phase panel with its storm controls named for assistive technology only. */
  tablePanel?: 'Table' | 'Phase';
}>;

/**
 * What a Stage changes in the header and the panels.
 * The fixture has no Stage and keeps its full Table panel.
 * Play keeps the turn and phase in the header and names that panel Phase.
 * A finished game shows its word and keeps the final phase readable.
 * Every other stage shows its word in the header and brings its own panels.
 */
function stageFrame(stage: GameSnapshot['stage']): StageFrame {
  switch (stage) {
    case undefined:
      return { tablePanel: 'Table' };
    case 'play':
      return { tablePanel: 'Phase' };
    case 'drafting':
      return { word: 'Drafting' };
    case 'swapping':
      return { word: 'Swapping' };
    case 'setup':
      return { word: 'Setup' };
    case 'finished':
      return { word: 'Finished', tablePanel: 'Phase' };
    case 'discarded':
      return { word: 'Discarded' };
  }
}

type PanelSources = Readonly<
  Pick<GameTableProps, 'panels' | 'tableControls' | 'tableGuidance' | 'showStormControls' | 'panelContent'> & StageFrame
>;

/* The host's groups, with the stage's own panel and the Table or Phase panel leading the Game group; a group left empty is dropped. */
function tablePanels({
  panels = [],
  tableControls,
  tableGuidance,
  showStormControls,
  word,
  tablePanel: tablePanelLabel,
  panelContent,
}: PanelSources): TablePanel[] {
  const tablePanel: TablePanel = {
    key: 'phase',
    label: tablePanelLabel ?? 'Table',
    topic: 'controls',
    ...tableGuidance,
    content: (
      <>
        {tableControls}
        {tablePanelLabel === 'Table' && <SpiceBankControls />}
        {tablePanelLabel === 'Table' && <SelectedPieceControl />}
        {showStormControls && <StormControls hiddenHeading={tablePanelLabel === 'Phase'} />}
      </>
    ),
  };
  const stagePanel: TablePanel | null = panelContent
    ? {
        key: 'stage',
        label: word ?? 'Game',
        topic: 'controls',
        content: panelContent,
        padding: false,
      }
    : null;
  return panels
    .map((group) =>
      group.key === 'game'
        ? {
            ...group,
            panels: [
              ...(stagePanel ? [stagePanel] : []),
              ...(tablePanelLabel ? [tablePanel] : []),
              ...(group.panels ?? []),
            ],
          }
        : group
    )
    .filter((group) => !group.panels || group.panels.length > 0);
}

function SpiceBankControls() {
  const canSpawn = useTabletopSelector((table) => table.canHandleTable && !table.state.draftMove);
  const { spawnSpice } = useTabletopCommands();
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
            disabled={!canSpawn}
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

/* The overlays this viewer pinned on from the game menu, shown whether or not their key is held. */
function usePinnedLabels() {
  const [pinned, setPinned] = useState<TableLabels>({
    counts: false,
    names: false,
  });
  return useMemo(
    () => ({
      pinned,
      toggle: (label: keyof TableLabels) =>
        setPinned((current) => ({
          ...current,
          [label]: !current[label],
        })),
    }),
    [pinned]
  );
}

/* A request already standing when the table mounts was answered by an earlier mount, so only a later revision moves the camera. */
function useRequestedView(
  requestedView: GameTableProps['requestedView'],
  selectView: (event: { type: 'view.selected'; view: TableView }) => void
) {
  const answeredRevision = useRef(requestedView?.revision);
  const requestedRevision = requestedView?.revision;
  const requestedTableView = requestedView?.view;
  useEffect(() => {
    if (requestedTableView && requestedRevision !== answeredRevision.current) {
      answeredRevision.current = requestedRevision;
      selectView({ type: 'view.selected', view: requestedTableView });
    }
  }, [requestedRevision, requestedTableView, selectView]);
}

/* Binds the keyboard owner to the window once; it reads the live table when a key needs it. */
function useTableKeyboardBinding(keyboard: TableKeyboard) {
  const read = useTabletopReader();
  useLayoutEffect(() => keyboard.bind({ events: window, read }), [keyboard, read]);
}
/* Names and controls wrap independently; the stage overlay and the camera dial start below the rendered header. */
function measureHeader(node: HTMLElement | null) {
  const shell = node?.closest<HTMLElement>('.dune-play-shell');
  if (!node || !shell) {
    return;
  }
  const update = () => shell.style.setProperty('--play-header-height', `${node.getBoundingClientRect().height}px`);
  const observer = new ResizeObserver(update);
  observer.observe(node);
  update();
  return () => observer.disconnect();
}

function useTableViewController(
  activePhase: GameTableProps['tableProgress']['phases'][number] | undefined,
  word: StageFrame['word'],
  requestedView: GameTableProps['requestedView']
) {
  const viewPhase = word || !activePhase ? null : standardPhaseOf(activePhase);
  const [viewState, dispatchView] = useReducer(reduceTableView, viewPhase, createTableViewState);
  if (viewState.phase !== viewPhase) {
    /* The phase changed since the last render; the reducer answers it before this render commits. */
    dispatchView({ type: 'phase.changed', phase: viewPhase });
  }
  const cameraView = useMemo<CameraViewCommand>(
    () => ({
      view: viewState.activeView,
      revision: viewState.cameraRevision,
    }),
    [viewState.activeView, viewState.cameraRevision]
  );

  useRequestedView(requestedView, dispatchView);

  const handleInteractionActiveChange = useCallback((active: boolean) => {
    dispatchView({ type: 'interaction.changed', active });
  }, []);
  const handleSceneReady = useCallback(() => dispatchView({ type: 'scene.ready' }), []);
  /* A renderer whose initialisation never settles (the story runner's headless one is such a renderer) must not keep the shell closed for good: the clock reports for it, and a later real report changes nothing. */
  useEffect(() => {
    const timer = setTimeout(handleSceneReady, SCENE_READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [handleSceneReady]);

  return { viewPhase, viewState, dispatchView, cameraView, handleInteractionActiveChange, handleSceneReady };
}

export function GameTable({
  sceneContent,
  readOnly = false,
  panels,
  focus,
  tableControls,
  tableGuidance,
  gameMenu,
  stageStatus,
  phaseTurns,
  stage,
  mapVisible,
  stageOverlay,
  panelContent,
  toolbarControl,
  connectionStatus,
  alliances,
  showStormControls,
  seatCount,
  tableProgress,
  requestedView,
}: GameTableProps) {
  const recall = useContext(CompassTableContext)?.recall;
  const [pointerSession] = useState(() => new PointerSession());
  const [tableKeyboard] = useState(() => new TableKeyboard());
  useTableKeyboardBinding(tableKeyboard);
  const gestureActive = useTabletopSelector((table) => table.gestureActivePieceId !== null);
  const heldOverlays = useHeldOverlays();
  const tableLabels = usePinnedLabels();
  const frame = stageFrame(stage);
  /* The camera follows the phase while the header names one: in play, and on the fixture. */
  /* A faction phase takes the camera view of the standard phase it precedes (#1138). */
  const activePhase = tableProgress.phases.find((entry) => entry.id === tableProgress.activePhaseId);
  const { viewPhase, viewState, dispatchView, cameraView, handleInteractionActiveChange, handleSceneReady } =
    useTableViewController(activePhase, frame.word, requestedView);
  const overlaysInert = viewState.interactionActive || gestureActive;

  const scene = (
    <TableKeyboardContext value={tableKeyboard}>
      <TabletopScene
        className="scene scene--immersive"
        cameraView={cameraView}
        onSceneReady={handleSceneReady}
        onInteractionActiveChange={handleInteractionActiveChange}
        readOnly={readOnly}
        seatCount={seatCount}
        tableProgress={tableProgress}
        stage={stage}
        mapVisible={mapVisible}
      >
        {sceneContent}
      </TabletopScene>
    </TableKeyboardContext>
  );
  const overlay = stageOverlay && (
    <div className="seated-stage-overlay" inert={overlaysInert}>
      {stageOverlay}
    </div>
  );
  /* The dial's choice; U asks for the top view through the compass's letters (compass/shortcuts.ts). */
  const selectView = (view: TableView) => dispatchView({ type: 'view.selected', view });
  const camera = (
    <SceneCamera
      hidden={Boolean(stageOverlay)}
      inert={overlaysInert}
      activeView={viewState.activeView}
      preferredView={viewPhase === null ? undefined : PHASE_VIEWS[viewPhase]}
      onSelect={selectView}
    />
  );
  /* No bar of its own: the table runs to the top, and the phase, the game and the controls float over it as chips. Only the chips hide the cursor, so pointing at the table between them still shows to the others. */
  const header = (
    <header ref={measureHeader} className="seated-header" inert={overlaysInert}>
      <div className="seated-header__start">
        <div className="seated-chip seated-phase-status" data-hides-cursor>
          <div className="seated-phase-status__live" aria-live="polite">
            {activePhase?.symbol && !frame.word ? <PhaseDisc symbol={activePhase.symbol} /> : null}
            {stageStatus ?? (
              <PhaseCopy
                word={frame.word}
                caption={turnCaption(tableProgress.turn, tableProgress.lastTurn)}
                label={activePhase?.label}
              />
            )}
          </div>
          {phaseTurns}
        </div>
        <div className="seated-chip seated-chip--game" data-hides-cursor>
          {alliances}
        </div>
      </div>

      <div className="seated-connection" data-hides-cursor>
        {connectionStatus}
      </div>

      <div className="seated-chip seated-toolbar" data-hides-cursor>
        {toolbarControl}
        <span className="seated-toolbar__settings">{gameMenu}</span>
      </div>
    </header>
  );

  return (
    <PointerSessionContext value={pointerSession}>
      <TableLabelsContext value={tableLabels}>
        <DarkSchemeIsland>
          {/* The stage stacks the waiting frame under the shell until the renderer is ready; then the frame goes and the shell opens through its iris. */}
          <div className="dune-play-stage" data-scene-ready={viewState.sceneReady}>
            {viewState.sceneReady ? null : <TableWait status="Opening the table..." />}
            <div
              className="dune-play-shell"
              {...darkSchemeIslandAttributes}
              data-board-gesture-active={overlaysInert}
              data-table-view={viewState.activeView}
              data-mentat-recall={Boolean(recall)}
              data-mentat-recall-loading={Boolean(recall?.loading)}
              data-show-counts={heldOverlays.counts || tableLabels.pinned.counts}
              data-show-names={heldOverlays.names || tableLabels.pinned.names}
            >
              <CompassControls
                scene={scene}
                decoration={<MentatRecallBackdrop active={Boolean(recall)} />}
                overlay={overlay}
                header={header}
                camera={camera}
                inert={overlaysInert}
                panels={tablePanels({
                  panels,
                  tableControls,
                  tableGuidance,
                  panelContent,
                  showStormControls,
                  word: frame.word,
                  tablePanel: frame.tablePanel,
                })}
                onView={selectView}
                focus={focus}
              />
            </div>
          </div>
        </DarkSchemeIsland>
      </TableLabelsContext>
    </PointerSessionContext>
  );
}
