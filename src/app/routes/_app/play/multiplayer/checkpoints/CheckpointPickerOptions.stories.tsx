import { Box, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import type { ComponentType } from 'react';
import { useState } from 'react';

import { longGameCheckpoints, offeredCheckpoints } from './checkpointPicker.stories.fixture';
import type { CheckpointPickerProps } from './checkpointTurns';
import { RecentFirstPicker } from './RecentFirstPicker';
import { TimelinePicker } from './TimelinePicker';
import { TurnGridPicker } from './TurnGridPicker';
import { TurnStepperPicker } from './TurnStepperPicker';

/*
 * Four ways to choose the checkpoint a table review asks for, each as it would sit in the Table review window.
 * `game` switches between a game ten turns in with its whole history, and the last thirty checkpoints the table offers today.
 */
type Args = { game: 'whole' | 'offered' };

const meta = preview.meta({
  title: 'Play/Explorations/Checkpoint picker',
  globals: { motion: 'on' },
  parameters: { layout: 'centered', chromatic: { disableSnapshot: true } },
  tags: ['!test'],
  args: { game: 'whole' } satisfies Args,
  argTypes: { game: { control: 'inline-radio', options: ['whole', 'offered'] } },
});

function Harness({ Picker, game }: Readonly<{ Picker: ComponentType<CheckpointPickerProps>; game: Args['game'] }>) {
  const checkpoints = game === 'whole' ? longGameCheckpoints() : offeredCheckpoints();
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

const harness = (Picker: ComponentType<CheckpointPickerProps>) => (args: unknown) => (
  <Harness key={(args as Args).game} Picker={Picker} game={(args as Args).game} />
);

/** A: every turn as a row of phase discs, newest on top; a battle's numbered dots sit beside its disc. */
export const TurnGrid = meta.story({ render: harness(TurnGridPicker) });

/** B: step through turns with − and +, then pick a phase of that turn; always one strip high. */
export const TurnStepper = meta.story({ render: harness(TurnStepperPicker) });

/** C: one slider over every checkpoint, marked per turn, with arrows for single steps. */
export const Timeline = meta.story({ render: harness(TimelinePicker) });

/** D: the five latest moments as a list, and earlier turns folded away as rows of phase discs. */
export const RecentFirst = meta.story({ render: harness(RecentFirstPicker) });
