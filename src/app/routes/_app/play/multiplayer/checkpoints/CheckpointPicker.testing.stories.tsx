import { Box } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

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

function SelectionHarness({
  checkpoints = offeredCheckpoints(),
}: Readonly<{ checkpoints?: ReturnType<typeof offeredCheckpoints> }>) {
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
    await waitForFrame(() => expect(slider).toHaveAttribute('aria-valuenow', '0'));
    await expect(args.onChange).not.toHaveBeenCalled();
    /* A separate pointer call starts with no button held, so the release is sent as the browser would send it. */
    track.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: box.left + 2, clientY: y }));
    await waitForFrame(() => expect(args.onChange).toHaveBeenCalledTimes(1));
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
    await waitForFrame(() => expect(args.onChange).toHaveBeenCalledTimes(1));
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
    await waitForFrame(() => expect(args.onChange).toHaveBeenCalledWith(args.checkpoints[0]!.step));
  },
});

/** Once the table has moved to a checkpoint asked for from the timeline, stepping back to where it was shows that checkpoint, not the old ask. */
export const StepsBackAfterAnAskLands = meta.story({
  render: () => <SelectionHarness checkpoints={offeredCheckpoints().slice(-2)} />,
  play: async ({ canvasElement }) => {
    const picker = within(canvasElement);
    const slider = picker.getByRole('slider', { name: 'Checkpoint' });
    const track = slider.closest<HTMLElement>('.mantine-Slider-trackContainer')!;
    const box = track.getBoundingClientRect();
    const at = { bubbles: true, clientX: box.left + 2, clientY: box.top + box.height / 2 };
    track.dispatchEvent(new MouseEvent('mousedown', { ...at, button: 0 }));
    track.dispatchEvent(new MouseEvent('mouseup', at));
    await waitForFrame(() => expect(picker.getByRole('button', { name: 'Earlier checkpoint' })).toBeDisabled());
    await userEvent.click(picker.getByRole('button', { name: 'Later checkpoint' }));
    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    await expect(picker.getByRole('button', { name: 'Earlier checkpoint' })).toBeEnabled();
  },
});

/** Choosing back the table's own checkpoint while an earlier choice is still on its way asks for it again, so the last choice stands. */
export const ReturnBeforeTheTableAnswers = meta.story({
  args: { checkpoints: offeredCheckpoints(), value: offeredCheckpoints().at(-1)!.step, onChange: fn() },
  play: async ({ args, canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Checkpoint' });
    const track = slider.closest<HTMLElement>('.mantine-Slider-trackContainer')!;
    const box = track.getBoundingClientRect();
    const click = (clientX: number) => {
      const at = { bubbles: true, clientX, clientY: box.top + box.height / 2 };
      track.dispatchEvent(new MouseEvent('mousedown', { ...at, button: 0 }));
      track.dispatchEvent(new MouseEvent('mouseup', at));
    };
    click(box.left + 2);
    await waitForFrame(() => expect(args.onChange).toHaveBeenCalledTimes(1));
    click(box.right - 2);
    await waitForFrame(() => expect(args.onChange).toHaveBeenCalledTimes(2));
    await expect(args.onChange).toHaveBeenLastCalledWith(args.value);
    await expect(slider).toHaveAttribute('aria-valuenow', String(args.checkpoints.length - 1));
  },
});

/** A choice the table could not be sent, as while it resyncs, leaves the thumb on the table's checkpoint and can be made again. */
export const UnsentChoiceCanBeMadeAgain = meta.story({
  args: { checkpoints: offeredCheckpoints(), value: offeredCheckpoints().at(-1)!.step, onChange: fn(() => false) },
  play: async ({ args, canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Checkpoint' });
    const track = slider.closest<HTMLElement>('.mantine-Slider-trackContainer')!;
    const box = track.getBoundingClientRect();
    const click = () => {
      const at = { bubbles: true, clientX: box.left + 2, clientY: box.top + box.height / 2 };
      track.dispatchEvent(new MouseEvent('mousedown', { ...at, button: 0 }));
      track.dispatchEvent(new MouseEvent('mouseup', at));
    };
    click();
    await waitForFrame(() => expect(args.onChange).toHaveBeenCalledTimes(1));
    await waitForFrame(() => expect(slider).toHaveAttribute('aria-valuenow', String(args.checkpoints.length - 1)));
    click();
    await waitForFrame(() => expect(args.onChange).toHaveBeenCalledTimes(2));
    await expect(args.onChange).toHaveBeenLastCalledWith(args.checkpoints[0]!.step);
  },
});
