import type { SplitLimits } from '@ui/layout/SplitPanels';
import { useSyncExternalStore } from 'react';

import { viewerPreference } from '../../../widgets/tabletop/viewerPreference';

/*
 * How this viewer lays out the table, a per-browser preference that never reaches the game.
 * `stacked` is the table above the dock; `columns` sets the controls, the table and the players side by side.
 */
export type TableLayout = 'stacked' | 'columns';

/* Stored as a number, since the viewer's preferences are numbers: 1 stacked, 2 columns. */
const layout = viewerPreference('dunezone-table-layout', { min: 1, max: 2, fallback: 1 });

export function useTableLayout(): TableLayout {
  return layout.use() === 2 ? 'columns' : 'stacked';
}

export function setTableLayout(next: TableLayout): void {
  layout.set(next === 'columns' ? 2 : 1);
}

/* The columns' widths, remembered once the viewer moves a separator. */
const controlsWidth = viewerPreference('dunezone-table-columns-controls', { min: 5, max: 60, fallback: 26 });
const playersWidth = viewerPreference('dunezone-table-columns-players', { min: 5, max: 60, fallback: 30 });

/** The controls column, in percent of the shell's width. */
export const useControlsColumnPercent = controlsWidth.use;
export const setControlsColumnPercent = controlsWidth.set;
/** The players column, in percent of the room the table and the players share. */
export const usePlayersColumnPercent = playersWidth.use;
export const setPlayersColumnPercent = playersWidth.set;

/*
 * The least each column keeps, in rem: room for the dock's rail and a form, for the table to stay a table, and for the players' names.
 * The table and the players together stay wider than the kit split's 40.75rem stacking width (SplitPanels.module.css),
 * so the split between them never stacks.
 */
const CONTROLS_MIN_REM = 18;
const SCENE_MIN_REM = 26;
const PLAYERS_MIN_REM = 16;
/* The separators' tracks between the three columns. */
const SEPARATORS_REM = 1;

/** The narrowest shell the three columns fit; a narrower window keeps the table above the dock. */
export const COLUMNS_MIN_WIDTH_REM = CONTROLS_MIN_REM + SCENE_MIN_REM + PLAYERS_MIN_REM + SEPARATORS_REM;

function rootFontSize(): number {
  const size = typeof document === 'undefined' ? NaN : parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

function percentLimits(room: number, least: number, others: number): SplitLimits {
  if (!Number.isFinite(room) || room <= 0) {
    return { min: 10, max: 60 };
  }
  const min = Math.min(100, (least / room) * 100);
  const max = Math.max(min, Math.min(60, ((room - others) / room) * 100));
  return { min, max };
}

/** The controls column keeps its floor and leaves the table and the players theirs. */
export function controlsColumnLimits(room: number, remPx = rootFontSize()): SplitLimits {
  return percentLimits(room, CONTROLS_MIN_REM * remPx, (SCENE_MIN_REM + PLAYERS_MIN_REM + 0.5) * remPx);
}

/** Without a players column, the controls column leaves only the table its floor. */
export function controlsColumnLimitsWithoutPlayers(room: number, remPx = rootFontSize()): SplitLimits {
  return percentLimits(room, CONTROLS_MIN_REM * remPx, SCENE_MIN_REM * remPx);
}

/** The players column keeps its floor and leaves the table its own. */
export function playersColumnLimits(room: number, remPx = rootFontSize()): SplitLimits {
  return percentLimits(room, PLAYERS_MIN_REM * remPx, SCENE_MIN_REM * remPx);
}

const COLUMNS_QUERY = `(min-width: ${COLUMNS_MIN_WIDTH_REM}rem)`;
let columnsQuery: MediaQueryList | null | undefined;

/* One query list for every reader; an environment without the media-query API (jsdom) has room for the columns. */
function widthQuery(): MediaQueryList | null {
  columnsQuery ??= typeof window.matchMedia === 'function' ? window.matchMedia(COLUMNS_QUERY) : null;
  return columnsQuery;
}

function subscribeToWidth(onChange: () => void) {
  const query = widthQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/** Whether the window is wide enough for the three columns. */
export function useColumnsFit(): boolean {
  return useSyncExternalStore(
    subscribeToWidth,
    () => widthQuery()?.matches ?? true,
    () => true
  );
}

/** The layout the table shows: the viewer's choice, where the window is wide enough for it. */
export function useShownTableLayout(): TableLayout {
  const chosen = useTableLayout();
  const fits = useColumnsFit();
  return chosen === 'columns' && fits ? 'columns' : 'stacked';
}
