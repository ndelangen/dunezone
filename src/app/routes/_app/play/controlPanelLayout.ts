import type { SplitLimits } from '@ui/layout/SplitPanels';

export const DEFAULT_CONTROLS_PANEL_PERCENT = 30;
export const MIN_CONTROLS_PANEL_PERCENT = 18;
export const MAX_CONTROLS_PANEL_PERCENT = 50;
export const PREFERRED_TABLETOP_SCENE_HEIGHT_PX = 320;

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

export function controlsPanelLimits(shellHeight: number): SplitLimits {
  return { min: MIN_CONTROLS_PANEL_PERCENT, max: maxControlsPanelPercentForHeight(shellHeight) };
}
