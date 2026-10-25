import preview from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { convexNeverAnswers } from '@db/storybook';

import { gameMeta, install, session } from './game.stories.fixture';
import { withoutGraphics, expectGraphicsMessage } from './opening.stories.fixture';
import {
  parameters,
  productTransport,
  playingSnapshot as initialSnapshot,
  playingSnapshot,
} from './product.stories.fixture';

/* The game page before its table opens: an unknown id, provisioning and the ways it can fail. The create form itself is Play/Create. */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Opening',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
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
    await page.findByText('Preparing the table', {}, { timeout: 30_000 });
    /* The page moves from the game's id to its slug and draws the status again, so each check finds it afresh. */
    await waitFor(() => expect(finishTransitions(page.getByText('Preparing the table'))).toBeVisible());
    /* The status precedes the ClientOnly share control's first committed render. */
    await expect(page.findByRole('button', { name: 'Copy game link' })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
    await expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
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

/* The motion verdict keeps the waiting frame still. */
export const ConnectingStill = meta.story({
  globals: { motion: 'reduce' },
  beforeEach: install(() => productTransport('seat-2', initialSnapshot(), { holdView: true })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByText('Connecting to the hosted table...', {}, { timeout: 30_000 });
    const frame = status.closest('[data-connection]')!;
    const view = canvasElement.ownerDocument.defaultView!;
    await expect(view.getComputedStyle(frame, '::before').animationName).toBe('none');
    await expect(view.getComputedStyle(status).animationName).toBe('none');
  },
});

/* A browser with neither WebGPU nor WebGL2 reads why the table is missing, and the shell around it still opens. */
export const WithoutGraphics = meta.story({
  beforeEach: withoutGraphics(undefined),
  play: async ({ canvasElement }) => expectGraphicsMessage(canvasElement),
});

/* A lost connection keeps the last table read-only, with recovery stated at the top centre. */
export const Reconnecting = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: /^Controls/ }, { timeout: 30_000 });
    session.transport.deliver({ type: 'admission', status: 'suspended' });
    const status = await page.findByRole('status', { name: /^Reconnecting\./ });
    const header = status.closest('.seated-header')!;
    await expect(header).not.toBeNull();
    await expect(status.closest('.seated-phase-status')).toBeNull();
    const frame = header.getBoundingClientRect();
    const notice = status.getBoundingClientRect();
    await expect(Math.abs(notice.left + notice.width / 2 - (frame.left + frame.width / 2))).toBeLessThan(2);
    await expect(status.closest('[data-connection]')).toHaveAttribute('data-connection', 'suspended');
    await expect(page.getByText('Reconnecting', { exact: true })).toBeVisible();
  },
});
