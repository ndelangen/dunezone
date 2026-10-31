import { Box } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

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

/** A drag names each checkpoint it passes but chooses only the one it is let go on, so a recall moves the table once. */
export const DragChoosesOnRelease = meta.story({
  args: { checkpoints: offeredCheckpoints(), value: offeredCheckpoints().at(-1)!.step, onChange: fn() },
  play: async ({ args, canvasElement }) => {
    const picker = within(canvasElement);
    const slider = picker.getByRole('slider', { name: 'Checkpoint' });
    const track = slider.closest<HTMLElement>('.mantine-Slider-trackContainer')!;
    const box = track.getBoundingClientRect();
    const y = box.top + box.height / 2;
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: track, coords: { clientX: box.right - 2, clientY: y } },
      { target: track, coords: { clientX: box.left + box.width / 2, clientY: y } },
      { target: track, coords: { clientX: box.left + 2, clientY: y } },
    ]);
    /* The slider follows the pointer on the next animation frame. */
    await waitFor(() => expect(slider).toHaveAttribute('aria-valuenow', '0'));
    await expect(args.onChange).not.toHaveBeenCalled();
    /* A separate pointer call starts with no button held, so the release is sent as the browser would send it. */
    track.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: box.left + 2, clientY: y }));
    await waitFor(() => expect(args.onChange).toHaveBeenCalledTimes(1));
    await expect(args.onChange).toHaveBeenCalledWith(args.checkpoints[0]!.step);
    /* The table has not moved yet, and the thumb waits where it was let go rather than snapping back. */
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
  },
});

/** A click let go before the slider's next frame still chooses the checkpoint it was made on, and the slider shows that one. */
export const QuickClickChoosesWhereItLands = meta.story({
  args: { checkpoints: offeredCheckpoints(), value: offeredCheckpoints().at(-1)!.step, onChange: fn() },
  play: async ({ args, canvasElement }) => {
    const picker = within(canvasElement);
    const slider = picker.getByRole('slider', { name: 'Checkpoint' });
    const track = slider.closest<HTMLElement>('.mantine-Slider-trackContainer')!;
    const box = track.getBoundingClientRect();
    const at = { bubbles: true, clientX: box.left + 2, clientY: box.top + box.height / 2 };
    /* Press and release in one task, so the release arrives before the slider has moved. */
    track.dispatchEvent(new MouseEvent('mousedown', { ...at, button: 0 }));
    track.dispatchEvent(new MouseEvent('mouseup', at));
    await waitFor(() => expect(args.onChange).toHaveBeenCalledTimes(1));
    await expect(args.onChange).toHaveBeenCalledWith(args.checkpoints[0]!.step);
    /* The table has not moved yet, and the thumb waits where it was let go rather than snapping back. */
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
  },
});

/** When the table sits on a step no longer offered, a click on the first checkpoint still asks for it. */
export const FirstCheckpointFromOneNoLongerOffered = meta.story({
  args: { checkpoints: offeredCheckpoints(), value: offeredCheckpoints()[0]!.step - 1, onChange: fn() },
  play: async ({ args, canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Checkpoint' });
    const track = slider.closest<HTMLElement>('.mantine-Slider-trackContainer')!;
    const box = track.getBoundingClientRect();
    const at = { bubbles: true, clientX: box.left + 2, clientY: box.top + box.height / 2 };
    track.dispatchEvent(new MouseEvent('mousedown', { ...at, button: 0 }));
    track.dispatchEvent(new MouseEvent('mouseup', at));
    await waitFor(() => expect(args.onChange).toHaveBeenCalledWith(args.checkpoints[0]!.step));
  },
});
