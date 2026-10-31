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
  },
});

/** A click let go before the slider's next frame still chooses the checkpoint it was made on. */
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

/** Every choice asks the table, so a choice that did not move it can be made again. */
export const EachChoiceAsksTheTable = meta.story({
  args: { checkpoints: offeredCheckpoints(), value: offeredCheckpoints().at(-1)!.step, onChange: fn() },
  play: async ({ args, canvasElement }) => {
    const earlier = within(canvasElement).getByRole('button', { name: 'Earlier checkpoint' });
    await userEvent.click(earlier);
    await userEvent.click(earlier);
    await expect(args.onChange).toHaveBeenCalledTimes(2);
    await expect(args.onChange).toHaveBeenLastCalledWith(args.checkpoints.at(-2)!.step);
  },
});

/** Letting go on the checkpoint the table shows still asks for it, so a return made before an earlier ask is answered lands last. */
export const ReturnToTheShownCheckpointAsksAgain = meta.story({
  args: { checkpoints: offeredCheckpoints(), value: offeredCheckpoints().at(-1)!.step, onChange: fn() },
  play: async ({ args, canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Checkpoint' });
    const track = slider.closest<HTMLElement>('.mantine-Slider-trackContainer')!;
    const box = track.getBoundingClientRect();
    const at = { bubbles: true, clientX: box.right - 2, clientY: box.top + box.height / 2 };
    track.dispatchEvent(new MouseEvent('mousedown', { ...at, button: 0 }));
    track.dispatchEvent(new MouseEvent('mouseup', at));
    await waitForFrame(() => expect(args.onChange).toHaveBeenCalledWith(args.value));
  },
});

/** A key step chooses its checkpoint at once, so a click on Ask straight after it asks for the checkpoint the key chose. */
export const KeyStepChoosesAtOnce = meta.story({
  args: { checkpoints: offeredCheckpoints(), value: offeredCheckpoints().at(-1)!.step, onChange: fn() },
  play: async ({ args, canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Checkpoint' });
    slider.focus();
    /* Sent and checked in one task, so no animation frame can run in between. */
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    await expect(args.onChange).toHaveBeenCalledWith(args.checkpoints[0]!.step);
  },
});

/** An arrow choice made before a quick click's move has landed wins, and the late move does not bring the clicked checkpoint back. */
export const ArrowAfterQuickClickHolds = meta.story({
  render: () => <SelectionHarness />,
  play: async ({ canvasElement }) => {
    const picker = within(canvasElement);
    const slider = picker.getByRole('slider', { name: 'Checkpoint' });
    const earlier = picker.getByRole('button', { name: 'Earlier checkpoint' });
    const track = slider.closest<HTMLElement>('.mantine-Slider-trackContainer')!;
    const box = track.getBoundingClientRect();
    const at = { bubbles: true, clientX: box.left + 2, clientY: box.top + box.height / 2 };
    const last = offeredCheckpoints().length - 1;
    /* The click and the arrow land in one task, before the slider's queued move. */
    track.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
    track.dispatchEvent(new MouseEvent('mousedown', { ...at, button: 0 }));
    track.dispatchEvent(new MouseEvent('mouseup', at));
    earlier.click();
    await waitForFrame(() => expect(slider).toHaveAttribute('aria-valuenow', String(last - 1)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await expect(slider).toHaveAttribute('aria-valuenow', String(last - 1));
  },
});
