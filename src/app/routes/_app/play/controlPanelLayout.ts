import type { SplitLimits } from '@ui/layout/SplitPanels';

export const DEFAULT_CONTROLS_PANEL_PERCENT = 30;
export const MIN_CONTROLS_PANEL_PERCENT = 18;
export const MAX_CONTROLS_PANEL_PERCENT = 50;
export const PREFERRED_TABLETOP_SCENE_HEIGHT_PX = 320;
/* The dock's own floor, `.seated-controls-panel { min-height: 17rem }` in dune-play.css. */
export const CONTROLS_DOCK_MIN_HEIGHT_REM = 17;

export const KEYBOARD_STEP_PERCENT = 2;
export const KEYBOARD_PAGE_STEP_PERCENT = 5;

/* The two dock panes each keep at least 28% of the dock's width, whatever that width is. */
const PANE_LIMITS: SplitLimits = { min: 28, max: 72 };

export function paneLimits(): SplitLimits {
  return PANE_LIMITS;
}

export function maxControlsPanelPercentForHeight(shellHeight: number): number {
  if (!Number.isFinite(shellHeight) || shellHeight <= 0) {
    return MAX_CONTROLS_PANEL_PERCENT;
  }
  const heightLimitedPercent = ((shellHeight - PREFERRED_TABLETOP_SCENE_HEIGHT_PX) / shellHeight) * 100;
  /* Keep controls reachable when the shell cannot fit both the scene target and the panel minimum. */
  return Math.max(MIN_CONTROLS_PANEL_PERCENT, Math.min(MAX_CONTROLS_PANEL_PERCENT, heightLimitedPercent));
}

function rootFontSize(): number {
  const size = typeof document === 'undefined' ? NaN : parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/*
 * The separator never goes above the dock's own floor: below it the dock would rise out of its panel
 * and the separator's line and grip would be drawn across the dock's first row.
 * When the shell cannot fit both, the dock keeps its floor and the scene gives way.
 */
export function controlsPanelLimits(shellHeight: number, remPx = rootFontSize()): SplitLimits {
  const dockPercent =
    Number.isFinite(shellHeight) && shellHeight > 0 ? ((CONTROLS_DOCK_MIN_HEIGHT_REM * remPx) / shellHeight) * 100 : 0;
  const min = Math.min(100, Math.max(MIN_CONTROLS_PANEL_PERCENT, dockPercent));
  return { min, max: Math.max(min, maxControlsPanelPercentForHeight(shellHeight)) };
}
