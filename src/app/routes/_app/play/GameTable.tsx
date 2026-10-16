import { Button, Group, Stack, Text } from '@mantine/core';
import { turnCaption } from '@shared/play/lastTurn';
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
import {
  controlsPanelLimits,
  DEFAULT_CONTROLS_PANEL_PERCENT,
  KEYBOARD_PAGE_STEP_PERCENT,
  KEYBOARD_STEP_PERCENT,
  paneLimits,
} from './controlPanelLayout';
import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import { Held, HeldSlot, useHeldNode } from './HeldContent';
import type { HeldNode } from './HeldContent';
import { TableLabelsContext } from './tableLabels';
import type { TableLabels } from './tableLabels';
import {
  controlsColumnLimits,
  controlsColumnLimitsWithoutPlayers,
  playersColumnLimits,
  setControlsColumnPercent,
  setPlayersColumnPercent,
  useControlsColumnPercent,
  usePlayersColumnPercent,
  useShownTableLayout,
} from './tableLayout';
import type { TableLayout } from './tableLayout';
import { TableWait } from './TableWait';

/* How long the shell waits for the renderer before opening anyway. */
const SCENE_READY_FALLBACK_MS = 1500;

/** One tab of the controls panel: what it is called, its glyph from the topic map, and what it shows. */
export type PanelTab = Readonly<{
  key: string;
  label: string;
  topic: TopicIconTopic;
  /** One line saying what the tab is for, under its name in the tab's tooltip. */
  description?: string;
  /** The tab's full guidance, in the tooltip once the pointer rests on the tab. */
  help?: string;
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
  /** The tabs the panel opens on, in preference, as a spectator opens past tabs whose controls are a seat's; without one present it opens on the first. */
  openOn?: readonly string[];
  /** Sections the host adds to the Table tab, above the fixture's trackers. */
  tableControls?: ReactNode;
  /** What the Table tab's tooltip says about it: play's Phase tab explains the phase. */
  tableGuidance?: Pick<PanelTab, 'description' | 'help'>;
  /** The game menu in the toolbar, present in every stage: what a player can do about their own seat. Previous and Next stay rightmost. */
  gameMenu?: ReactNode;
  gameIdentity?: ReactNode;
  toolbarControl?: ReactNode;
  /** The connection's state, beside the logo where the bar has room, present only while the table is not live. */
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
  /* Play chrome laid over the scene for a stage, between the header and the panel: the drafting ledger. */
  stageOverlay?: ReactNode;
  /* A stage's own panel in place of the tabs: the drafting panel. Its tab's pane is flush, so the content insets itself with --nested-tabs-panel-inset. */
  panelContent?: ReactNode;
  playerPanel?: ReactNode;
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
};

/* Where each view sits on the dial: the board at the top, the bays to the sides, the bottom stem below. */
const DIAL_ANGLES: Record<TableView, number> = {
  map: 180,
  left: 90,
  right: 270,
  bottom: 0,
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

/* The dial rides on the dock's top edge, so it stays over the scene where a short window grows the dock up over it. A stage overlay hides the table, and the dial with it. */
function SceneCamera({ hidden, ...dial }: Readonly<{ hidden: boolean } & Parameters<typeof TableViewDial>[0]>) {
  if (hidden) {
    return null;
  }
  return (
    <div className="seated-camera" data-hides-cursor>
      <TableViewDial {...dial} />
    </div>
  );
}

/* The camera dial in the scene's corner: the needle points at the view the camera holds, a ring marks the phase's recommended view, and each letter moves the camera there. */
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
    <div className="camera-dial" role="group" aria-label="Table view">
      <span className="camera-dial__needle" style={{ rotate: `${DIAL_ANGLES[activeView]}deg` }} aria-hidden="true" />
      <span className="camera-dial__hub" aria-hidden="true" />
      {TABLE_VIEW_OPTIONS.map((view) => {
        const phasePreferred = preferredView === view.id;
        return (
          <button
            key={view.id}
            type="button"
            className="camera-dial__view"
            data-view={view.id}
            title={`Camera: ${view.label}`}
            aria-label={`Focus on ${view.label.toLowerCase()}${phasePreferred ? ', recommended for this phase' : ''}`}
            aria-pressed={activeView === view.id}
            data-phase-preferred={phasePreferred || undefined}
            onClick={() => onSelect(view.id)}
          >
            {DIAL_LETTERS[view.id]}
          </button>
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
  /** The Game group's last stage control: the fixture's full Table tab, or play's Phase tab with its storm controls named for assistive technology only. */
  tableTab?: 'Table' | 'Phase';
}>;

/**
 * What a Stage changes in the header and the panel.
 * The fixture has no Stage and keeps its full Table tab.
 * Play keeps the turn and phase in the header and names that tab Phase.
 * A finished game shows its word and keeps the final phase readable.
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

/* Which destination the controls panel shows, which child each group last opened, and what a focus or the stage opened over. */
type ControlsSelection = Readonly<{
  path: string[];
  remembered: Record<string, string>;
  stageShown: boolean;
  stageOpened: boolean;
  focused: string | null;
  beneath: string[] | null;
}>;

type ControlsSelectionEvent =
  | { type: 'destination-selected'; path: string[] }
  | { type: 'stage-changed'; shown: boolean }
  | { type: 'focus-requested'; path: string[]; token: string };

function reduceControlsSelection(state: ControlsSelection, event: ControlsSelectionEvent): ControlsSelection {
  if (event.type === 'stage-changed') {
    return { ...state, stageShown: event.shown, stageOpened: event.shown };
  }
  const group = event.path[0]!;
  const child = event.path[1] ?? state.remembered[group];
  const path = child ? [group, child] : [group];
  const stageOpened = path[1] === 'stage';
  return {
    ...state,
    focused: event.type === 'focus-requested' ? event.token : state.focused,
    /* The destination a focus opened over, so when the focused tab closes, as a result does, the panel returns to it. */
    beneath:
      event.type === 'focus-requested' && state.path.join('/') !== event.path.join('/') ? state.path : state.beneath,
    stageOpened,
    path: stageOpened ? state.path : path,
    remembered: !stageOpened && child ? { ...state.remembered, [group]: child } : state.remembered,
  };
}

/* Focus and opening preferences name a destination, whether it is a group or one of its children. */
function tabPath(tabs: readonly PanelTab[], key: string) {
  for (const tab of tabs) {
    if (tab.key === key) {
      return [tab.key];
    }
    const child = tab.subtabs?.find((item) => item.key === key);
    if (child) {
      return [tab.key, child.key];
    }
  }
  return undefined;
}

/* One tab of either level, which opens the destination at `path`. */
function tabItem(tab: PanelTab, path: string[], onClick: () => void) {
  return (
    <NestedTabs.Item
      key={tab.key}
      as="button"
      type="button"
      path={path}
      label={tab.label}
      description={tab.description}
      help={tab.help}
      icon={<TopicIcon topic={tab.topic} size={22} />}
      onClick={onClick}
    />
  );
}

type DockTabsProps = Readonly<
  Pick<GameTableProps, 'panelTabs' | 'tableControls' | 'tableGuidance' | 'showStormControls' | 'panelContent'> &
    StageFrame
>;

/* The host's groups, with the stage's own panel and the Table or Phase tab leading the Game group; a group left empty is dropped. */
function dockTabs({
  panelTabs = [],
  tableControls,
  tableGuidance,
  showStormControls,
  word,
  tableTab: tableTabLabel,
  panelContent,
}: DockTabsProps): PanelTab[] {
  const tableTab: PanelTab = {
    key: 'phase',
    label: tableTabLabel ?? 'Table',
    topic: 'controls',
    ...tableGuidance,
    content: (
      <>
        {tableControls}
        {tableTabLabel === 'Table' && <SpiceBankControls />}
        {tableTabLabel === 'Table' && <SelectedPieceControl />}
        {showStormControls && <StormControls hiddenHeading={tableTabLabel === 'Phase'} />}
      </>
    ),
  };
  const stageTab: PanelTab | null = panelContent
    ? {
        key: 'stage',
        label: word ?? 'Game',
        topic: 'controls',
        content: panelContent,
        padding: false,
      }
    : null;
  return panelTabs
    .map((tab) =>
      tab.key === 'game'
        ? {
            ...tab,
            subtabs: [...(stageTab ? [stageTab] : []), ...(tableTabLabel ? [tableTab] : []), ...(tab.subtabs ?? [])],
          }
        : tab
    )
    .filter((tab) => !tab.subtabs || tab.subtabs.length > 0);
}

/*
 * The tab and subtab the panel shows: the stage while it is open, else the chosen destination,
 * or the one a focus opened over once the focused tab has closed; a group stands in for a child that is gone.
 */
function shownDestination(
  tabs: readonly PanelTab[],
  selection: ControlsSelection,
  hasStage: boolean,
  opening: string[]
) {
  const pathTo = (key: string) => tabPath(tabs, key);
  const closed = !pathTo(selection.path.at(-1)!) && selection.beneath;
  const path = selection.stageOpened && hasStage ? pathTo('stage')! : closed || selection.path;
  const active = tabs.find((tab) => tab.key === path[0]) ?? tabs.find((tab) => tab.key === opening[0]) ?? tabs[0];
  const subtab = active?.subtabs?.find((tab) => tab.key === path[1]) ?? active?.subtabs?.[0];
  return { active, subtab };
}

/** The panel's chosen destination, kept in step with the stage and with each new focus request. */
function useControlsSelection(
  tabs: readonly PanelTab[],
  opening: string[],
  hasStage: boolean,
  focusTab: GameTableProps['focusTab']
) {
  const [selection, select] = useReducer(reduceControlsSelection, {
    path: opening,
    remembered: {},
    stageShown: hasStage,
    stageOpened: false,
    focused: null,
    beneath: null,
  });
  /* A newly seated drafter sees their stage. The previous destination remains underneath for playback and later stages. */
  if (hasStage !== selection.stageShown) {
    select({ type: 'stage-changed', shown: hasStage });
  }
  /* A group opens on its remembered child while that child still exists, else on its first, so a closed tab such as Result is never chosen again. */
  const choose = ([key, child = selection.remembered[key!]]: string[]) => {
    const subtabs = tabs.find((tab) => tab.key === key)?.subtabs;
    const leaf = subtabs?.some((tab) => tab.key === child) ? child : subtabs?.[0]?.key;
    select({ type: 'destination-selected', path: leaf ? [key!, leaf] : [key!] });
  };
  /* A battle focuses its nested planner only once; subsequent updates preserve the player's choice. */
  const focus = pendingFocus(tabs, focusTab, selection.focused);
  if (focus) {
    select({ type: 'focus-requested', ...focus });
  }
  return [selection, choose] as const;
}

/* A focus request the panel has not yet followed, while its tab exists. */
function pendingFocus(
  tabs: readonly PanelTab[],
  focusTab: GameTableProps['focusTab'],
  focused: ControlsSelection['focused']
) {
  if (!focusTab || focusTab.token === focused) {
    return null;
  }
  const path = tabPath(tabs, focusTab.key);
  return path ? { path, token: focusTab.token } : null;
}

/**
 * The controls panel groups personal resources, game actions, shared controls and history in two levels.
 * Each group remembers its last destination;
 * the current stage and phase join the Game group.
 * The per-player tabs are the host's `playerPanel`, in the pane beside this one.
 */
function TableControlsPanel({
  focusTab = null,
  openOn = [],
  ...dock
}: DockTabsProps & Readonly<Pick<GameTableProps, 'focusTab' | 'openOn'>>) {
  const tabs = dockTabs(dock);
  const opening = openOn.map((key) => tabPath(tabs, key)).find(Boolean) ?? [tabs[0]?.key ?? 'game'];
  const hasStage = Boolean(dock.panelContent);
  const [selection, choose] = useControlsSelection(tabs, opening, hasStage, focusTab);
  const { active, subtab } = shownDestination(tabs, selection, hasStage, opening);
  /* Before play there is nothing to step, select or place, and each earlier stage brings its own accepted panel with its delivery; until then the dock holds only what the stage brings. */
  if (!active) {
    return null;
  }
  return (
    <NestedTabs
      activePath={subtab ? [active.key, subtab.key] : [active.key]}
      ariaLabel="Table controls"
      className="seated-controls-tabs"
    >
      <NestedTabs.Level label="Controls">
        {tabs.map((tab) => tabItem(tab, [tab.key], () => choose([tab.key])))}
      </NestedTabs.Level>
      {active.subtabs && (
        <NestedTabs.Level label={active.label}>
          {active.subtabs.map((tab) => tabItem(tab, [active.key, tab.key], () => choose([active.key, tab.key])))}
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

function controlsPanelValueText(percent: number) {
  return `${Math.round(percent)}% of the window for controls`;
}

/* Names and controls wrap independently; the stage overlay starts below the rendered header. */
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

/* The scene's height above the dock the camera dial needs, in rem: the dial, the gap under it for its caption, and room above it. */
const CAMERA_ROOM_REM = 5.75 + 1.6 + 2 * 0.75;

/* The play shell and its header around the dock, once both are mounted. */
function dockFrame(node: HTMLElement) {
  const shell = node.closest<HTMLElement>('.dune-play-shell');
  const header = shell?.querySelector<HTMLElement>('.seated-header');
  return shell && header ? { shell, header } : null;
}

/*
 * Where the dock starts within the shell, and whether the scene above it is too low for the camera dial.
 * There the dial moves into the dock's upper right corner instead of reaching under the header's chips or the separator.
 */
function measureDock(node: HTMLElement | null) {
  const frame = node && dockFrame(node);
  if (!frame) {
    return;
  }
  const { shell, header } = frame;
  const update = () => {
    const top = node.getBoundingClientRect().top - shell.getBoundingClientRect().top;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    shell.style.setProperty('--play-dock-top', `${top}px`);
    shell.dataset.cameraDocked = String(top - header.getBoundingClientRect().height < CAMERA_ROOM_REM * rem);
  };
  const observer = new ResizeObserver(update);
  for (const element of [node, shell, header]) {
    observer.observe(element);
  }
  update();
  /* A layout without the dock leaves nothing behind for the dial's rules to read. */
  return () => {
    observer.disconnect();
    shell.style.removeProperty('--play-dock-top');
    delete shell.dataset.cameraDocked;
  };
}

type LayoutProps = Readonly<{
  /** The held scene, controls and players; no players node when the stage has no players panel. */
  nodes: Readonly<{ scene: HeldNode; controls: HeldNode; players: HeldNode | null }>;
  camera: ReactNode;
  inert: boolean;
}>;

/* The controls, the table and the players side by side; the separators either side of the table resize the columns and are remembered. */
function ColumnsLayout({ nodes, camera, inert }: LayoutProps) {
  const controlsPercent = useControlsColumnPercent();
  const playersPercent = usePlayersColumnPercent();
  const scene = (
    <>
      <HeldSlot node={nodes.scene} />
      <div className="seated-column-camera" inert={inert}>
        {camera}
      </div>
    </>
  );
  return (
    <SplitPanels
      orientation="vertical"
      defaultSize={controlsPercent}
      limits={nodes.players ? controlsColumnLimits : controlsColumnLimitsWithoutPlayers}
      step={KEYBOARD_STEP_PERCENT}
      pageStep={KEYBOARD_PAGE_STEP_PERCENT}
      label="Resize controls column"
      onSizeChange={setControlsColumnPercent}
    >
      <SplitPanels.First>
        <div className="seated-controls-panel seated-controls-panel--column" inert={inert}>
          <HeldSlot node={nodes.controls} />
        </div>
      </SplitPanels.First>
      <SplitPanels.Second>
        {nodes.players ? (
          <SplitPanels
            orientation="vertical"
            primary="second"
            defaultSize={playersPercent}
            limits={playersColumnLimits}
            step={KEYBOARD_STEP_PERCENT}
            pageStep={KEYBOARD_PAGE_STEP_PERCENT}
            label="Resize players column"
            onSizeChange={setPlayersColumnPercent}
          >
            <SplitPanels.First>{scene}</SplitPanels.First>
            <SplitPanels.Second>
              <div className="seated-controls-panel seated-controls-panel--column" inert={inert}>
                <HeldSlot node={nodes.players} />
              </div>
            </SplitPanels.Second>
          </SplitPanels>
        ) : (
          scene
        )}
      </SplitPanels.Second>
    </SplitPanels>
  );
}

/* The table above the dock, whose two panes hold the controls and the players. */
function StackedLayout({ nodes, camera, inert }: LayoutProps) {
  return (
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
        <HeldSlot node={nodes.scene} />
      </SplitPanels.First>
      <SplitPanels.Second>
        <div ref={measureDock} className="seated-controls-panel" inert={inert}>
          {camera}
          <PanelPanes secondary={nodes.players && <HeldSlot node={nodes.players} />}>
            <HeldSlot node={nodes.controls} />
          </PanelPanes>
        </div>
      </SplitPanels.Second>
    </SplitPanels>
  );
}

/*
 * The layout this viewer picked in the game menu, where the window is wide enough for it.
 * Each layout is keyed, so neither inherits the other's separator size.
 */
function TableLayouts({ layout, ...props }: LayoutProps & Readonly<{ layout: TableLayout }>) {
  return layout === 'columns' ? <ColumnsLayout key="columns" {...props} /> : <StackedLayout key="stacked" {...props} />;
}

export function GameTable({
  sceneContent,
  panelTabs,
  focusTab,
  openOn,
  tableControls,
  tableGuidance,
  gameMenu,
  gameIdentity,
  stageStatus,
  stage,
  mapVisible,
  stageOverlay,
  panelContent,
  playerPanel,
  toolbarControl,
  connectionStatus,
  alliances,
  showStormControls,
  seatCount,
  tableProgress,
  requestedView,
}: GameTableProps) {
  const [pointerSession] = useState(() => new PointerSession());
  const [tableKeyboard] = useState(() => new TableKeyboard());
  useTableKeyboardBinding(tableKeyboard);
  const gestureActive = useTabletopSelector((table) => table.gestureActivePieceId !== null);
  const heldOverlays = useHeldOverlays();
  const tableLabels = usePinnedLabels();
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
  const overlaysInert = viewState.interactionActive || gestureActive;
  const cameraView = useMemo<CameraViewCommand>(
    () => ({
      view: viewState.activeView,
      revision: viewState.cameraRevision,
    }),
    [viewState.activeView, viewState.cameraRevision]
  );
  const activePhaseIndex = tableProgress.phases.findIndex((phase) => phase.id === tableProgress.activePhaseId);
  const activePhase = tableProgress.phases[activePhaseIndex];

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

  const layout = useShownTableLayout();
  const sceneNode = useHeldNode();
  const controlsNode = useHeldNode();
  const playersNode = useHeldNode();
  const scene = (
    <>
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
    </>
  );
  const camera = (
    <SceneCamera
      hidden={Boolean(stageOverlay)}
      activeView={viewState.activeView}
      preferredView={viewPhase === null ? undefined : PHASE_VIEWS[viewPhase]}
      onSelect={(view) => dispatchView({ type: 'view.selected', view })}
    />
  );
  const controls = (
    <TableControlsPanel
      panelTabs={panelTabs}
      focusTab={focusTab}
      openOn={openOn}
      tableControls={tableControls}
      tableGuidance={tableGuidance}
      panelContent={panelContent}
      word={frame.word}
      tableTab={frame.tableTab}
      showStormControls={showStormControls}
    />
  );

  return (
    <PointerSessionContext value={pointerSession}>
      <TableLabelsContext value={tableLabels}>
        <DarkSchemeIsland>
          {/* The stage stacks the waiting frame under the shell until the renderer is ready; then the frame goes and the shell opens through its iris. */}
          <div className="dune-play-stage" data-scene-ready={viewState.sceneReady}>
            {viewState.sceneReady ? null : <TableWait status="Opening the table..." />}
            <div
              className="dune-play-shell dune-play-shell--seated"
              {...darkSchemeIslandAttributes}
              data-board-gesture-active={overlaysInert}
              data-table-view={viewState.activeView}
              data-table-layout={layout}
              data-show-counts={heldOverlays.counts || tableLabels.pinned.counts}
              data-show-names={heldOverlays.names || tableLabels.pinned.names}
            >
              {/* The header sits outside the split, in the shell's own stacking, so it paints above the dock where the dock's floor grows up over the scene. It comes before the split so its controls lead the reading and Tab order.
                It has no bar of its own: the table runs to the top, and the phase, the game and the controls float over it as chips. Only the chips hide the cursor, so pointing at the table between them still shows to the others. */}
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
                    {/* The connection status is its own status region, so it stays outside the phase's live region and is announced once. */}
                    {connectionStatus}
                  </div>
                  <div className="seated-chip seated-chip--game" data-hides-cursor>
                    {gameIdentity}
                    {alliances}
                  </div>
                </div>

                <div className="seated-chip seated-toolbar" data-hides-cursor>
                  {toolbarControl}
                  <span className="seated-toolbar__settings">{gameMenu}</span>
                </div>
              </header>

              <Held node={sceneNode}>{scene}</Held>
              <Held node={controlsNode}>{controls}</Held>
              {playerPanel && <Held node={playersNode}>{playerPanel}</Held>}

              <TableLayouts
                layout={layout}
                nodes={{ scene: sceneNode, controls: controlsNode, players: playerPanel ? playersNode : null }}
                camera={camera}
                inert={overlaysInert}
              />
            </div>
          </div>
        </DarkSchemeIsland>
      </TableLabelsContext>
    </PointerSessionContext>
  );
}
