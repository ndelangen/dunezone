import preview from '@sb/preview';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { productTransport } from './product.stories.fixture';
import { finishedSnapshot } from './results.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Results',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

export const FinishedSpectator = meta.story({
  beforeEach: install(() => productTransport(SPECTATOR_SEAT, finishedSnapshot(SPECTATOR_SEAT))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText(/The table stays as it was/, {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Continue playing' })).toBeNull();
  },
});
