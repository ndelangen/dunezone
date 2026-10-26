import preview from '@sb/preview';
import { within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Bug reports',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

export const Form = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    await openTab(within(canvasElement.ownerDocument.body), 'Report a bug');
  },
});
