import { createContext, use } from 'react';

/** The table labels a player can pin on: stack counts (hold Alt) and piece names (hold Ctrl). */
export type TableLabels = Readonly<{ counts: boolean; names: boolean }>;

export const TABLE_LABEL_OPTIONS = [
  { id: 'counts', name: 'Stack counts', key: 'Alt' },
  { id: 'names', name: 'Piece names', key: 'Ctrl' },
] as const;

/* The game table owns the pinned labels; the settings menu toggles them from wherever the host puts it. */
export const TableLabelsContext = createContext<Readonly<{
  pinned: TableLabels;
  toggle(label: keyof TableLabels): void;
}> | null>(null);

export function useTableLabels() {
  return use(TableLabelsContext);
}
