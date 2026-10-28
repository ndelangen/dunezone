import preview from '@sb/preview';

import { longGameCheckpoints, offeredCheckpoints } from './checkpointPicker.stories.fixture';
import { PickerHarness } from './checkpointPickerHarness.stories.fixture';
import { TurnGridPicker } from './TurnGridPicker';

/* The checkpoint a table review asks for, chosen as it sits in the Table review window. */
const meta = preview.meta({
  title: 'Play/Panels/Checkpoint picker',
  component: TurnGridPicker,
  globals: { motion: 'on' },
  parameters: { layout: 'centered' },
});

/** A game eleven turns in, every checkpoint kept: the rows scroll, newest on top. */
export const WholeGame = meta.story({
  render: () => <PickerHarness Picker={TurnGridPicker} checkpoints={longGameCheckpoints()} />,
});

/** The last thirty checkpoints, which is what the table offers a review. */
export const Offered = meta.story({
  render: () => <PickerHarness Picker={TurnGridPicker} checkpoints={offeredCheckpoints()} />,
});
