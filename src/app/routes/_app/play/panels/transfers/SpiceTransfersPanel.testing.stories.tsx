import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { playingSnapshot } from '../../product.stories.fixture';
import { transfersPanelMeta } from './SpiceTransfersPanel.stories.fixture';

const meta = testingPreview.meta({ ...transfersPanelMeta, title: 'Play/Panels/Spice transfers' });

/* Public spice transfers name each end in words (#1664): a faction's spice reserve by its name, the table and the Spice Bank, and a faction gone from the roster as such. */
export const EndsInWords = meta.story({
  play: async ({ canvas }) => {
    const faction = playingSnapshot().roster!.seats[1]!.faction!;
    await expect(canvas.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Thialfi returned 1 spice to the Spice Bank.',
      'Thialfi collected 3 spice from the table to a faction no longer in the game.',
      'Twaffle took 6 spice from the Spice Bank to the table.',
      `Thialfi withdrew 2 spice from the ${faction.name} spice reserve to the table.`,
    ]);
  },
});

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
