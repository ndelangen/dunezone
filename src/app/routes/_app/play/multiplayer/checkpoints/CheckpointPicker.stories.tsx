import { Box, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import type { ReviewCheckpoint } from '@shared/play/review';
import { useState } from 'react';

import { longGameCheckpoints, offeredCheckpoints } from './checkpointPicker.stories.fixture';
import { TurnGridPicker } from './TurnGridPicker';

/* The checkpoint a table review asks for, chosen as it sits in the Table review window. */
const meta = preview.meta({
  title: 'Play/Panels/Checkpoint picker',
  component: TurnGridPicker,
  globals: { motion: 'on' },
  parameters: { layout: 'centered' },
});

function Harness({ checkpoints }: Readonly<{ checkpoints: ReviewCheckpoint[] }>) {
  const [value, setValue] = useState<number | null>(checkpoints.at(-1)?.step ?? null);
  return (
    <Box w={380} p="md" bg="var(--ui-ground)" style={{ borderRadius: 8 }}>
      <Stack gap="xs">
        <Text size="sm" fw={700}>
          Checkpoint
        </Text>
        <TurnGridPicker checkpoints={checkpoints} value={value} onChange={setValue} />
      </Stack>
    </Box>
  );
}

/** A game eleven turns in, every checkpoint kept: the rows scroll, newest on top. */
export const WholeGame = meta.story({ render: () => <Harness checkpoints={longGameCheckpoints()} /> });

/** The last thirty checkpoints, which is what the table offers a review. */
export const Offered = meta.story({ render: () => <Harness checkpoints={offeredCheckpoints()} /> });
