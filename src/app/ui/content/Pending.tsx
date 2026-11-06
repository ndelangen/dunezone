import { Group, Loader, Text } from '@mantine/core';

export interface PendingProps {
  /** What is on its way, as a short sentence: "Loading factions". */
  children: string;
}

/**
 * A small spinner and the words for what is loading, in place of the thing itself: a picker's list, a chosen draft, a recalled hand.
 * A `status` live region, so the wait is heard as well as seen;
 * the words are visible, so nobody has to guess what the spinner is for.
 * For a whole page still loading, use the pending `PageState` instead.
 */
export function Pending({ children }: PendingProps) {
  return (
    <Group gap="xs" wrap="nowrap" justify="center" py="xs" role="status">
      <Loader size="xs" aria-hidden />
      <Text size="sm" c="dimmed">
        {children}
      </Text>
    </Group>
  );
}
