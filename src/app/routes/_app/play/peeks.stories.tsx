import preview from '@sb/preview';

import { gameMeta, install } from './game.stories.fixture';
import { manyPeekersSnapshot, onePeekerSnapshot } from './peeks.stories.fixture';
import { tablePage } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Peek markers',
  globals: { motion: 'on' },
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/**
 * Seat 1's faction looked through the Treachery deck, and seat 3's faction peeked at the loose Treachery card beside the board.
 * Each carries the peeker's faction token, small, in its bottom right corner, for everyone to see until the card is drawn or the deck shuffled.
 */
export const OnePeeker = meta.story({
  beforeEach: install(() => productTransport('seat-2', onePeekerSnapshot())),
  play: async ({ canvasElement }) => {
    await tablePage(canvasElement);
  },
});

/**
 * Many factions can peek at the same cards: four looked through the Treachery deck, two at the loose card, and all six at the Traitor deck.
 * Their tokens lie side by side from the bottom right corner towards the left, the first to peek in the corner.
 */
export const ManyPeekers = meta.story({
  beforeEach: install(() => productTransport('seat-2', manyPeekersSnapshot())),
  play: async ({ canvasElement }) => {
    await tablePage(canvasElement);
  },
});
