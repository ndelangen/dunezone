import { createContext, useContext } from 'react';

/*
 * Which controls the table shows: the classic dock of tabs, or the compass with its pinned slots (Norbert, 2026-10-24).
 * Storybook and the New controls play-test chapter choose the compass through the context; real games never do, so they
 * keep the classic layout until a game menu setting offers the choice.
 */
export type TableControls = 'classic' | 'compass';

export const TableControlsContext = createContext<TableControls>('classic');

/** Bumping it starts the controls afresh, as the tutorial's Reset does: nothing open, pinned or resized. */
export const TableControlsEpochContext = createContext(0);

export function useTableControls(): TableControls {
  return useContext(TableControlsContext);
}
