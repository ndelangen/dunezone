import { Stack, Text, Title } from '@mantine/core';

export interface NotAvailableProps {
  /** What the reader does not get, in their words, "Ruleset not found" or "You cannot edit this ruleset". */
  title: string;
  /** Why not, in one sentence. */
  children: string;
}

/**
 * Says that a page has nothing to show, and why not.
 *
 * The third of the load states beside `LoadPending` and `LoadError`, covering both ways a page ends up empty on purpose: the thing is not there, or it is not the reader's.
 * They are one component because they are one sentence to the reader and one arrangement on screen;
 * the difference between "deleted" and "not yours" lives entirely in the words, which is why the words are the caller's.
 *
 * Unlike `LoadError` this announces nothing, and that is deliberate.
 * Nothing failed and nothing is in flight, so the page has finished, with this as its content.
 *
 * It exists because nine of these sentences are spelled out across seven routes and only three carry a heading, one of them a raw `h2`, so on the rest a screen reader meets a loose sentence with no outline entry above it.
 */
export function NotAvailable({ title, children }: NotAvailableProps) {
  return (
    <Stack gap="xs">
      <Title order={2}>{title}</Title>
      <Text c="dimmed">{children}</Text>
    </Stack>
  );
}
