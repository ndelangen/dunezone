import { createContext, useContext } from 'react';

/*
 * Design exploration only (Norbert, 2026-10-24): other ways to lay out the table's controls so they cover less of the screen.
 * Storybook sets one of these through the context; the app never does, so the table keeps its two layouts.
 */
export type ControlsExperiment = 'floating-pair' | 'docking' | 'palette' | 'pie' | 'drawers' | 'fan' | 'swap';

export const ControlsExperimentContext = createContext<ControlsExperiment | null>(null);

export function useControlsExperiment(): ControlsExperiment | null {
  return useContext(ControlsExperimentContext);
}

/** The designs that take each tab on its own, rather than the controls dock as a whole. */
export function experimentTakesTabs(experiment: ControlsExperiment | null): boolean {
  return experiment === 'docking' || experiment === 'palette' || experiment === 'pie' || experiment === 'fan' || experiment === 'drawers';
}
