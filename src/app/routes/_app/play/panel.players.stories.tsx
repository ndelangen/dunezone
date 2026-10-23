import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { gameMeta, install, seatPopover } from './game.stories.fixture';
import { battleStory } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Players',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** A spectator of a full game reads that from the header's seat action; the dock keeps its height for the tabs. */
export const FullGameSpectatorSeat = meta.story({
  beforeEach: install(() => productTransport('neutral', battleStory('revealed', true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const seat = await seatPopover(canvasElement, 'You are watching');
    await expect(seat().findByText('All 6 seats are taken')).resolves.toBeVisible();
    await expect(seat().queryByRole('button', { name: /^Request/ })).toBeNull();
    const dock = canvasElement.ownerDocument.querySelector<HTMLElement>('.seated-controls-panel')!;
    await expect(within(dock).queryByRole('region', { name: 'You are watching' })).toBeNull();
    await expect(page.getAllByRole('region', { name: 'You are watching' })).toHaveLength(1);
  },
});
