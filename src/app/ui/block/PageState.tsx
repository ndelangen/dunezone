import { Stack, Text, Title } from '@mantine/core';

export interface PageStateProps {
  /**
   * `pending`: the page's content has not arrived yet, and the message is announced as a `status` live region.
   * `absent`: the page has nothing to show on purpose, because the thing is not there or is not the reader's;
   * nothing is announced, since the page has finished.
   */
  kind: 'pending' | 'absent';
  /** What the reader is waiting for or does not get, in their words: "Loading faction", "Ruleset not found", "You cannot edit this ruleset". */
  title: string;
  /** The second line: what is still on its way, or why not. */
  children: string;
}

/**
 * Says that a page has nothing to show yet, or nothing to show at all, and why.
 *
 * `LoadError`'s sibling for the two states where nothing failed: a heading and one sentence, both the caller's, because "Loading faction" and "Ruleset not found" are the page's words about its own subject.
 * Waiting and absence were two components with the same arrangement;
 * the only difference is the announcement, so that is all `kind` decides.
 * A waiting reader who cannot see the page hears that it is loading instead of meeting silence.
 */
export function PageState({ kind, title, children }: PageStateProps) {
  return (
    <Stack gap="xs" role={kind === 'pending' ? 'status' : undefined}>
      <Title order={2}>{title}</Title>
      <Text c="dimmed">{children}</Text>
    </Stack>
  );
}
