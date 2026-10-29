import preview from '@sb/preview';

import { boardSystemSnapshot } from './boards.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { productTransport } from './product.stories.fixture';

/*
 * A game with several boards (Norbert, 2026-10-29): one main board and up to six extra boards round its upper half,
 * each about two thirds its size. The extras fill their slots in order: one on top, two left and right, then up the sides.
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

/** One extra board, on top. */
export const OneExtraBoard = meta.story({
  beforeEach: install(() => productTransport('seat-2', boardSystemSnapshot(1))),
});

/** Two extra boards, left and right, past the card shelves. */
export const TwoExtraBoards = meta.story({
  beforeEach: install(() => productTransport('seat-2', boardSystemSnapshot(2))),
});

/** Three extra boards: left, right and top. */
export const ThreeExtraBoards = meta.story({
  beforeEach: install(() => productTransport('seat-2', boardSystemSnapshot(3))),
});

/** Four extra boards: left, right, and up both sides. */
export const FourExtraBoards = meta.story({
  beforeEach: install(() => productTransport('seat-2', boardSystemSnapshot(4))),
});

/** Five extra boards: four round the sides and one on top. */
export const FiveExtraBoards = meta.story({
  beforeEach: install(() => productTransport('seat-2', boardSystemSnapshot(5))),
});

/** Six extra boards, the most: seven boards in all. */
export const SixExtraBoards = meta.story({
  beforeEach: install(() => productTransport('seat-2', boardSystemSnapshot(6))),
});
