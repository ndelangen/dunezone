import preview from '@sb/preview';

import { twoBoardSnapshot } from './boards.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { productTransport } from './product.stories.fixture';

/*
 * The two-board table(Norbert, 2026-10-29): the main board with the player stations on the right, a second board of
 *the same size on the left with the trackers along the top over it, and four tabs below for the decks, the Tleilaxu
 * Tanks and the shared table inventory.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Boards',
  globals: { motion: 'on' },
  parameters: { ...gameMeta.parameters, chromatic: { disableSnapshot: true } },
  tags: ['!test'],
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** A game in play on the two-board table, seen from a seat. */
export const TwoBoardTable = meta.story({
  beforeEach: install(() => productTransport('seat-2', twoBoardSnapshot())),
});
