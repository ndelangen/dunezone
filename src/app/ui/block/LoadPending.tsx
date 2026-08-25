import { Stack, Text, Title } from '@mantine/core';

export interface LoadPendingProps {
  /** What has not arrived, as the reader would say it, "Loading faction". */
  title: string;
  /** The second line, naming what is still on its way. */
  children: string;
}

/**
 * Says that a page's content has not arrived yet.
 *
 * `LoadError`'s sibling on the other side of the wait, and the same shape: words in, one arrangement out.
 * What it owns beyond the arrangement is the announcement.
 * The message is a `status` live region, so a reader who cannot see the page hears that it is loading instead of meeting silence, which is the part every hand-written copy of this left out.
 *
 * Both sentences are the caller's, because "Loading faction" and "The faction catalogue is still loading" are the page's words about its own subject;
 * a component that supplied them would be guessing the noun.
 *
 * It exists because the heading-and-sentence pair was written out five times across four routes while five further routes said the same thing as a loose line with no heading and nothing announced, so whether a waiting reader was told anything at all depended on which page they had opened.
 */
export function LoadPending({ title, children }: LoadPendingProps) {
  return (
    <Stack gap="xs" role="status">
      <Title order={2}>{title}</Title>
      <Text c="dimmed">{children}</Text>
    </Stack>
  );
}
