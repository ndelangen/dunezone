import { Text } from '@mantine/core';

export interface EmptyNoteProps {
  /** What the section would hold, said as its absence: "No factions created yet." */
  children: string;
}

/**
 * The one line a page section shows when it has nothing to list yet, under the section's own heading.
 *
 * No pane around it: an empty box reads like a field waiting for input, and the heading already frames the line.
 * Not italic and not boxed, wherever it stands, so every "nothing here yet" on a detail page looks the same (Norbert, 2026-11-07).
 * `EmptyResults` is its catalogue sibling, for a search or a list page that came back empty.
 */
export function EmptyNote({ children }: EmptyNoteProps) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}
