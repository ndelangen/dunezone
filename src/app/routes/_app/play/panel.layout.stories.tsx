import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { WAIT } from './controls.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Layout',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** A spectator's dock opens on History and its game log. */
export const SpectatorOpensOnLog = meta.story({
  beforeEach: install(() => productTransport('neutral')),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('tab', { name: 'Game log' }, WAIT)).resolves.toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tablist', { name: 'Controls' }).querySelector('[aria-label="Table"]')).toHaveAttribute(
      'aria-selected',
      'false'
    );
  },
});
