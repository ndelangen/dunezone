import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/*
 * A controls layout on trial (Norbert, 2026-10-24): the compass with pinned slots, the fourth stage of the command palette,
 * so the controls cover less of the screen. Storybook and the New controls play-test chapter set it through the context;
 * real games never do, so they keep their two layouts. The earlier stages live on branch claude/controls-layout-prototype-stages.
 */
export type ControlsExperiment = 'palette-4';

export const ControlsExperimentContext = createContext<ControlsExperiment | null>(null);

/** Bumping it starts the experiment afresh, as the tutorial's Reset does: nothing open, pinned or resized. */
export const ControlsEpochContext = createContext(0);

export function useControlsExperiment(): ControlsExperiment | null {
  return useContext(ControlsExperimentContext);
}

/** The designs that take each tab on its own, rather than the controls dock as a whole. */
export function experimentTakesTabs(experiment: ControlsExperiment | null): boolean {
  return experiment !== null;
}

/** One player as the palette's chat bar and player windows see them. */
export type ExperimentPlayer = Readonly<{
  seat: string;
  name: string;
  factionName: string | null;
  token: string | null;
  unread: number;
  own: boolean;
  canConverse: boolean;
  attention: boolean;
  ally: boolean;
}>;

/** What the hosted table hands the palette's second stage: the players, the table's chat, and one player's window. */
export type ExperimentPlayers = Readonly<{
  players: readonly ExperimentPlayer[];
  tableChat: Readonly<{ unread: number }> | null;
  render: (seat: string, tab: 'public' | 'conversation') => ReactNode;
}>;

export const ExperimentPlayersContext = createContext<ExperimentPlayers | null>(null);
