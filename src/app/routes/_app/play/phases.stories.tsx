import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { factionPhaseSnapshot } from './phases.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Phases',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

export const FactionPhaseReadiness = meta.story({
  beforeEach: install(() => productTransport('seat-2', factionPhaseSnapshot(true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('button', { name: /^Ready$/ })).toBeVisible(), { timeout: 30_000 });
    const header = canvasElement.ownerDocument.querySelector('.seated-header') as HTMLElement;
    await expect(within(header).getByText('Guild negotiations')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
  },
});
