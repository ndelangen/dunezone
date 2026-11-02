import preview from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import type { BribePilePlacement } from '@shared/play/bribes';
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

/* Every faction has a bribe pile where the option puts it, from 1 to 5 spice; the map view shows them all, and each seat's own view shows its pile up close. */
const piles = (placement: BribePilePlacement) => ({
  beforeEach: install(() => productTransport('seat-2', bribePilesSnapshot(placement))),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await tablePage(canvasElement);
  },
});

/** Option A: behind the troops, at the table's edge, tucked in a gap between two troop reserves. */
export const BehindTheTroops = meta.story(piles('behind-troops'));

/** Option B: on the ring beside the faction token, wherever the token now stands in storm order. */
export const BesideTheToken = meta.story(piles('beside-token'));

/** Option C: one more place along the arc the troop reserves stand on, at its end. */
export const AtTheEndOfTheTroops = meta.story(piles('end-of-troops'));

/** Option D: in front of the faction token, toward the board, beside where withdrawn spice lands. */
export const InFrontOfTheToken = meta.story(piles('before-token'));

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
