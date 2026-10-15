import preview from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { convexNeverAnswers } from '@db/storybook';

import { gameMeta } from './game.stories.fixture';
import { parameters } from './product.stories.fixture';

/* The game page before its table opens: an unknown id, provisioning and the ways it can fail. The create form itself is Play/Create. */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Opening',
});

/** An id that names no game reads as not available, like any id the directory cannot find. */
export const UnknownGame = meta.story({
  args: { path: '/play/not-a-game' },
  parameters: parameters('ready'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('This game is not available', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to lobby' })).toHaveAttribute('href', '/play');
    await expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const Preparing = meta.story({
  parameters: parameters('pending'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByText('Preparing the table', {}, { timeout: 30_000 });
    await waitFor(() => expect(finishTransitions(status)).toBeVisible());
    /* The status precedes the ClientOnly share control's first committed render. */
    await expect(page.findByRole('button', { name: 'Copy game link' })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
    await expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const CatalogueRefused = meta.story({
  parameters: parameters(
    'expired',
    'This ruleset is not ready: spice: Spice deck, Publish every member and back before requesting this asset.'
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('This game could not be prepared', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByText(/Publish every member and back/)).toBeVisible();
    await expect(page.queryByText('Preparing the table')).toBeNull();
    await expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const ProvisionTimedOut = meta.story({
  parameters: parameters('expired'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('The table was not ready in time. Create the game again from the lobby.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});

/** A game link whose server never answers says so after ten seconds, with the Lobby button still there. */
export const GameServerUnreachable = meta.story({
  decorators: [convexNeverAnswers],
  parameters: parameters('ready'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByText("Can't reach the server. Retrying...", {}, { timeout: 30_000 });
    /* The status line eases in, so the wait finishes its animation rather than waiting on drawn frames. */
    await waitFor(() => expect(finishTransitions(status)).toBeVisible());
    await expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
    await expect(page.queryByText('Loading the game...')).toBeNull();
  },
});
