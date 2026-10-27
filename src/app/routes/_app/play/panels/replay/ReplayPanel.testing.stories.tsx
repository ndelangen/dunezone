import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { replayPanelMeta } from './ReplayPanel.stories.fixture';

const meta = testingPreview.meta({ ...replayPanelMeta, title: 'Play/Panels/Replay' });

/** The replay starts at the first saved phase. */
export const ReplaysFromTheStart = meta.story({
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Replay from start' }));
    await expect(args.onStep).toHaveBeenCalledWith(0);
  },
});

/** While a phase loads, the start waits and the way back to live is offered. */
export const Loading = meta.story({
  args: { pending: true },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText('Loading playback...')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Replay from start' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Return to live' }));
    await expect(args.onLive).toHaveBeenCalledOnce();
  },
});

/** A table that cannot replay now, such as one mid-move or reconnecting, greys the start out. */
export const CannotStart = meta.story({
  args: { replay: { kind: 'live', canStart: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Replay from start' })).toBeDisabled();
  },
});

/** A fixture table steps a phase at a time, and stops at either end. */
export const StepsThroughPhases = meta.story({
  args: { replay: { kind: 'browsing', step: 0, lastStep: 2 } },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Earlier phase' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Later phase' }));
    await expect(args.onStep).toHaveBeenCalledWith(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Return to live' }));
    await expect(args.onLive).toHaveBeenCalledOnce();
  },
});
