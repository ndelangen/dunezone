import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, userEvent, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { productTransport } from './product.stories.fixture';
import { endedSnapshot, finishedSnapshot, lastPlayerSnapshot } from './results.stories.fixture';

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

/* The last player at a game in play ends it from the game menu, where every other player gives up their seat. */
export const LastPlayerEndsTheGame = meta.story({
  beforeEach: install(() => productTransport('seat-2', lastPlayerSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Game menu' }, { timeout: 30_000 }));
    await waitForFrame(() => expect(page.getByRole('menuitem', { name: 'Hold to end the game' })).toBeVisible());
  },
});

/* Ended by its last player: no winner, and it can still continue where it stopped. */
export const EndedByTheLastPlayer = meta.story({
  beforeEach: install(() => productTransport('seat-2', endedSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText(/resumes the game where it stopped/, {}, { timeout: 30_000 })).resolves.toBeVisible();
  },
});
