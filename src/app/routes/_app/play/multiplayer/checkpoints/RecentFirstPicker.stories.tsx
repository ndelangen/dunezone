import preview from '@sb/preview';

import { longGameCheckpoints, offeredCheckpoints } from './checkpointPicker.stories.fixture';
import { PickerHarness } from './checkpointPickerHarness.stories.fixture';
import { RecentFirstPicker } from './RecentFirstPicker';

/* Option D for the Table review checkpoint picker: the five latest moments as a list, and earlier turns folded away as rows of phase discs. */
const meta = preview.meta({
  title: 'Play/Explorations/Checkpoint picker D',
  component: RecentFirstPicker,
  globals: { motion: 'on' },
  parameters: { layout: 'centered', chromatic: { disableSnapshot: true } },
  tags: ['!test'],
});

/** A game eleven turns in, every checkpoint kept. */
export const WholeGame = meta.story({
  render: () => <PickerHarness Picker={RecentFirstPicker} checkpoints={longGameCheckpoints()} />,
});

/** The last thirty checkpoints, which is what the table offers a review. */
export const Offered = meta.story({
  render: () => <PickerHarness Picker={RecentFirstPicker} checkpoints={offeredCheckpoints()} />,
});
