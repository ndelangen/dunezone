import { gameAssetColors } from '@shared/play/assetColors';
import type { tableProgressFor } from '@shared/play/phases';
import type { TrackerArcSlot } from '@shared/play/tableTrackers';
import { playUiColors } from '@shared/uiPalette';

import { PHASE_DISC_COLOR } from './phaseSymbolLayout';

/* The last turn sets how many sectors the turn wheel has; a table that names none plays the standard ten. */
export type TableProgress = Readonly<ReturnType<typeof tableProgressFor> & { lastTurn?: number }>;

export const TRACKER_DISC_ACTIVE_COLOR = playUiColors.activeTracker;
export const SPICE_DISC_COLOR = gameAssetColors.spiceDisc;

export function activePhaseIndex(progress: TableProgress): number {
  return progress.phases.findIndex((phase) => phase.id === progress.activePhaseId);
}

export function trackerDiscColor(slot: TrackerArcSlot, currentPhaseIndex: number): string {
  if (slot.kind === 'spice') {
    return SPICE_DISC_COLOR;
  }
  return slot.kind === 'phase' && slot.phaseIndex === currentPhaseIndex ? TRACKER_DISC_ACTIVE_COLOR : PHASE_DISC_COLOR;
}
