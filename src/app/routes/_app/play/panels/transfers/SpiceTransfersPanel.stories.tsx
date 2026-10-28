import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { playingSnapshot } from '../../product.stories.fixture';
import { transfersPanelMeta, transfersProps } from './SpiceTransfersPanel.stories.fixture';

/* The Spice transfers window on its own: the table's public spice movements, newest first. */
const meta = preview.meta({ ...transfersPanelMeta, title: 'Play/Panels/Spice transfers' });

/** Every kind of transfer, each end named in words (#1664): a faction's spice reserve by its name, the table, the Spice Bank, and a faction gone from the roster as such. */
export const Transfers = meta.story({
  play: async ({ canvas }) => {
    const faction = playingSnapshot().roster!.seats[1]!.faction!;
    await expect(canvas.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Krell returned 1 spice to the Spice Bank.',
      'Krell collected 3 spice from the table to the spice reserve of a faction that has left the game.',
      'Central took 6 spice from the Spice Bank to the table.',
      `Krell withdrew 2 spice from the ${faction.name} spice reserve to the table.`,
    ]);
  },
});

/** An older page of a longer history: it reads further back or returns to the newest. */
export const OlderPage = meta.story({ args: { more: true, latest: false } });

/** No spice has moved yet. */
export const Empty = meta.story({ args: transfersProps(playingSnapshot()) });
