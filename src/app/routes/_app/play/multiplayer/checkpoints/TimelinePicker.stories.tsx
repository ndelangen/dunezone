import preview from '@sb/preview';

import { longGameCheckpoints, offeredCheckpoints } from './checkpointPicker.stories.fixture';
import { PickerHarness } from './checkpointPickerHarness.stories.fixture';
import { TimelinePicker } from './TimelinePicker';

/* Option C for the Table review checkpoint picker: one slider over every checkpoint, marked per turn, with arrows for single steps. */
const meta = preview.meta({
  title: 'Play/Explorations/Checkpoint picker C',
  component: TimelinePicker,
  globals: { motion: 'on' },
  parameters: { layout: 'centered', chromatic: { disableSnapshot: true } },
  tags: ['!test'],
});

/** A game eleven turns in, every checkpoint kept. */
export const WholeGame = meta.story({
  render: () => <PickerHarness Picker={TimelinePicker} checkpoints={longGameCheckpoints()} />,
});

/** The last thirty checkpoints, which is what the table offers a review. */
export const Offered = meta.story({
  render: () => <PickerHarness Picker={TimelinePicker} checkpoints={offeredCheckpoints()} />,
});
