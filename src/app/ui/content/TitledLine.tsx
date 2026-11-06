import { Box, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export interface TitledLineProps {
  /** The thing's name. */
  title: string;
  /** What kind of thing it is, or whose: "Treachery card · Norbert". */
  detail: string;
  /** A small picture before the words, such as a face preview. Decorative: the words carry the meaning. */
  media?: ReactNode;
}

/**
 * A bold name over a dimmed detail line, both kept to one line and cut with an ellipsis when the row is narrow, optionally after a small picture.
 * The shape of a picker option or a listed row: five copies of it had drifted to three weights and two line heights, some wrapping and some cutting.
 */
export function TitledLine({ title, detail, media }: TitledLineProps) {
  const words = (
    <Stack gap={2} miw={0} flex={1}>
      <Text size="sm" fw={700} lh={1.25} truncate>
        {title}
      </Text>
      <Text size="xs" c="dimmed" lh={1.2} truncate>
        {detail}
      </Text>
    </Stack>
  );
  if (media == null) {
    return words;
  }
  return (
    <Group gap="sm" wrap="nowrap" align="center" miw={0} flex={1}>
      <Box aria-hidden display="contents">
        {media}
      </Box>
      {words}
    </Group>
  );
}
