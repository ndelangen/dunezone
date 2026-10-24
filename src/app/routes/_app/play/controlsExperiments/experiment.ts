import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/*
 * Design exploration only (Norbert, 2026-10-24): other ways to lay out the table's controls so they cover less of the screen.
 * Storybook sets one of these through the context; the app never does, so the table keeps its two layouts.
 * `palette-2` and `palette-3` are the second and third stages of the command palette, after Norbert picked it to iterate on.
 */
export type ControlsExperiment = 'floating-pair' | 'docking' | 'palette' | 'pie' | 'drawers' | 'fan' | 'swap' | 'palette-2' | 'palette-3';

export const ControlsExperimentContext = createContext<ControlsExperiment | null>(null);

export function useControlsExperiment(): ControlsExperiment | null {
  return useContext(ControlsExperimentContext);
}

/** The designs that take each tab on its own, rather than the controls dock as a whole. */
export function experimentTakesTabs(experiment: ControlsExperiment | null): boolean {
  return experiment !== null && experiment !== 'floating-pair' && experiment !== 'swap';
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
