import { testingPreview } from '@sb/preview';
import { expect, within } from 'storybook/test';

import { CheckpointPicker } from './CheckpointPicker';
import { offeredCheckpoints } from './checkpointPicker.stories.fixture';

const meta = testingPreview.meta({
  title: 'Play/Panels/Checkpoint picker',
  component: CheckpointPicker,
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
