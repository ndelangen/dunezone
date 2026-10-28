import { Box, Stack, Text } from '@mantine/core';
import type { ReviewCheckpoint } from '@shared/play/review';
import type { ComponentType } from 'react';
import { useState } from 'react';

import type { CheckpointPickerProps } from './checkpointTurns';

/* A checkpoint picker as it sits in the Table review window, holding its own choice so a story can be clicked through. */
export function PickerHarness({
  Picker,
  checkpoints,
}: Readonly<{
  Picker: ComponentType<CheckpointPickerProps>;
  checkpoints: ReviewCheckpoint[];
}>) {
  const [value, setValue] = useState<number | null>(checkpoints.at(-1)?.step ?? null);
  return (
    <Box w={380} p="md" bg="var(--ui-ground)" style={{ borderRadius: 8 }}>
      <Stack gap="xs">
        <Text size="sm" fw={700}>
          Checkpoint
        </Text>
        <Picker checkpoints={checkpoints} value={value} onChange={setValue} />
      </Stack>
    </Box>
  );
}
