import { Box } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { CheckpointPicker } from './CheckpointPicker';
import { longGameCheckpoints, offeredCheckpoints } from './checkpointPicker.stories.fixture';

const meta = testingPreview.meta({
  title: 'Play/Panels/Checkpoint picker',
  component: CheckpointPicker,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <Box w={380} p="md" bg="var(--ui-ground)" style={{ borderRadius: 8 }}>
        <Story />
      </Box>
    ),
  ],
});

/** A retained window starts partway through Turn 10; only the start of Turn 11 is marked. */
export const RetainedTurnStarts = meta.story({
  args: {
    checkpoints: offeredCheckpoints(),
    value: offeredCheckpoints().at(-1)!.step,
    onChange: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const picker = within(canvasElement);
    await expect(picker.queryByText('10', { exact: true })).toBeNull();
    await expect(picker.getByText('11', { exact: true })).toBeVisible();
  },
});

const firstCheckpoint = longGameCheckpoints().slice(0, 1);

/** The first saved checkpoint shows its details before there is a range to choose from. */
export const SingleCheckpoint = meta.story({
  args: { checkpoints: firstCheckpoint, value: firstCheckpoint[0]!.step, onChange: () => undefined },
  play: async ({ canvasElement }) => {
    const picker = within(canvasElement);
    await expect(picker.queryByRole('slider', { name: 'Checkpoint' })).toBeNull();
    await expect(picker.getByText('Setup, Traitor selection', { exact: true })).toBeVisible();
  },
});

function SelectionHarness() {
  const checkpoints = offeredCheckpoints();
  const [value, setValue] = useState(checkpoints.at(-1)!.step);
  return <CheckpointPicker checkpoints={checkpoints} value={value} onChange={setValue} />;
}

/** The selected checkpoint is the slider's spoken value and follows its step actions. */
export const SpokenSelection = meta.story({
  render: () => <SelectionHarness />,
  play: async ({ canvasElement }) => {
    const picker = within(canvasElement);
    const slider = picker.getByRole('slider', { name: 'Checkpoint' });
    await expect(slider).toHaveAttribute('aria-valuetext', 'Turn 11, Battle · after battle 1');
    await userEvent.click(picker.getByRole('button', { name: 'Earlier checkpoint' }));
    await expect(slider).toHaveAttribute('aria-valuetext', 'Turn 11, Battle · start');
  },
});
