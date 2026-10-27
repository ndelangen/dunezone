import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { transfersPanelMeta } from './SpiceTransfersPanel.stories.fixture';

const meta = testingPreview.meta({ ...transfersPanelMeta, title: 'Play/Panels/Spice transfers' });

/** An older page reads further back or returns to the newest. */
export const PagesThroughTransfers = meta.story({
  args: { more: true, latest: false },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Earlier spice transfers' }));
    await expect(args.onEarlier).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Latest spice transfers' }));
    await expect(args.onLatest).toHaveBeenCalledOnce();
  },
});
