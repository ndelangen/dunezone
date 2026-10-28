import preview from '@sb/preview';

import { longGameCheckpoints, offeredCheckpoints } from './checkpointPicker.stories.fixture';
import { PickerHarness } from './checkpointPickerHarness.stories.fixture';
import { TurnStepperPicker } from './TurnStepperPicker';

/* Option B for the Table review checkpoint picker: step through turns with − and +, then pick a phase of that turn; always one strip high. */
const meta = preview.meta({
  title: 'Play/Explorations/Checkpoint picker B',
  component: TurnStepperPicker,
  globals: { motion: 'on' },
  parameters: { layout: 'centered', chromatic: { disableSnapshot: true } },
  tags: ['!test'],
});

/** A game eleven turns in, every checkpoint kept. */
export const WholeGame = meta.story({
  render: () => <PickerHarness Picker={TurnStepperPicker} checkpoints={longGameCheckpoints()} />,
});

/** The last thirty checkpoints, which is what the table offers a review. */
export const Offered = meta.story({
  render: () => <PickerHarness Picker={TurnStepperPicker} checkpoints={offeredCheckpoints()} />,
});
