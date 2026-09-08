export const DEFAULT_CONTROLS_PANEL_PERCENT = 30;
export const MIN_CONTROLS_PANEL_PERCENT = 18;
export const MAX_CONTROLS_PANEL_PERCENT = 50;
export const MIN_TABLETOP_SCENE_HEIGHT_PX = 320;

const KEYBOARD_STEP_PERCENT = 2;
const KEYBOARD_PAGE_STEP_PERCENT = 5;

export function maxControlsPanelPercentForHeight(shellHeight: number): number {
  if (!Number.isFinite(shellHeight) || shellHeight <= 0) {
    return MAX_CONTROLS_PANEL_PERCENT;
  }
  const heightLimitedPercent = ((shellHeight - MIN_TABLETOP_SCENE_HEIGHT_PX) / shellHeight) * 100;
  return Math.max(MIN_CONTROLS_PANEL_PERCENT, Math.min(MAX_CONTROLS_PANEL_PERCENT, heightLimitedPercent));
}

export function clampControlsPanelPercent(percent: number, maximumPercent = MAX_CONTROLS_PANEL_PERCENT): number {
  const safeMaximum = Math.max(MIN_CONTROLS_PANEL_PERCENT, Math.min(MAX_CONTROLS_PANEL_PERCENT, maximumPercent));
  return Math.max(MIN_CONTROLS_PANEL_PERCENT, Math.min(safeMaximum, percent));
}

export function controlsPanelPercentFromPointer(
  clientY: number,
  shellTop: number,
  shellHeight: number,
  maximumPercent = MAX_CONTROLS_PANEL_PERCENT
): number {
  if (!Number.isFinite(shellHeight) || shellHeight <= 0) {
    return DEFAULT_CONTROLS_PANEL_PERCENT;
  }
  const percent = ((shellTop + shellHeight - clientY) / shellHeight) * 100;
  return clampControlsPanelPercent(percent, maximumPercent);
}

export function controlsPanelPercentForKey(
  currentPercent: number,
  key: string,
  maximumPercent = MAX_CONTROLS_PANEL_PERCENT
): number | null {
  const nextPercent =
    key === 'ArrowUp'
      ? currentPercent + KEYBOARD_STEP_PERCENT
      : key === 'ArrowDown'
        ? currentPercent - KEYBOARD_STEP_PERCENT
        : key === 'PageUp'
          ? currentPercent + KEYBOARD_PAGE_STEP_PERCENT
          : key === 'PageDown'
            ? currentPercent - KEYBOARD_PAGE_STEP_PERCENT
            : key === 'Home'
              ? MIN_CONTROLS_PANEL_PERCENT
              : key === 'End'
                ? MAX_CONTROLS_PANEL_PERCENT
                : null;
  return nextPercent === null ? null : clampControlsPanelPercent(nextPercent, maximumPercent);
}
