import type { TrackerArcSlot } from '@shared/play/tableTrackers';

import { PHASE_DISC_COLOR } from './phaseSymbolLayout';

export * from '@shared/play/tableTrackers';

type TablePhase = Readonly<{
  id: string;
  label: string;
  symbol?: string;
}>;

export type TableProgress = Readonly<{
  turn: number;
  phases: readonly TablePhase[];
  activePhaseId: string | null;
}>;

export const TRACKER_DISC_ACTIVE_COLOR = '#d96861';

export function activePhaseIndex(progress: TableProgress): number {
  return progress.phases.findIndex((phase) => phase.id === progress.activePhaseId);
}

export function trackerDiscColor(slot: TrackerArcSlot, currentPhaseIndex: number): string {
  return slot.kind === 'phase' && slot.phaseIndex === currentPhaseIndex ? TRACKER_DISC_ACTIVE_COLOR : PHASE_DISC_COLOR;
}
