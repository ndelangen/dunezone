import preview from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { bribePilesSnapshot, carryOnto, giftPoints, looseSpiceSnapshot } from './bribes.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { tablePage } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Bribes',
  globals: { motion: 'on' },
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** Every faction has a bribe pile behind its troops at the table's edge, from 1 to 5 spice; the map view shows them all, and each seat's own view shows its pile up close. */
export const BribePiles = meta.story({
  beforeEach: install(() => productTransport('seat-2', bribePilesSnapshot())),
  play: async ({ canvasElement }) => {
    await tablePage(canvasElement);
  },
});

/**
 * Seat 2 lifts 1 of its 3 spice onto seat 3's faction token and lets go: the spice waits over the token while a ring asks what it is.
 * Bribe sets it on that faction's bribe pile.
 * Payment puts it straight into that faction's spice reserve.
 * Closing the ring puts the spice back.
 * Try it by hand: drag any spice onto another faction's token.
 */
export const BribeOrPayment = meta.story({
  beforeEach: install(() => productTransport('seat-2', looseSpiceSnapshot())),
  play: async ({ canvasElement }) => {
    const { document, page } = await tablePage(canvasElement);
    const { spice, token } = giftPoints(looseSpiceSnapshot());
    await carryOnto(document, spice, token);
    const ring = await waitFor(() => page.getByRole('menu', { name: /^Give 1 spice to / }), { timeout: 30_000 });
    await expect(finishTransitions(ring)).toBeVisible();
    await expect(within(ring).getByRole('menuitem', { name: /^Bribe / })).toBeInTheDocument();
    await expect(within(ring).getByRole('menuitem', { name: /^Pay / })).toBeInTheDocument();
  },
});
