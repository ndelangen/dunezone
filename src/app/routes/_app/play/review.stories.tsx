import preview from '@sb/preview';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { reviewableSnapshot, reviewCheckpoints, reviewOf, reviewTransport } from './review.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Table review',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const bidding = reviewCheckpoints().find((checkpoint) => checkpoint.context === 'Turn 1, Bidding')!;

/* A seated player asks the table to look back; the others agree a moment later and the checkpoint shows for everyone. */
export const AskForAReview = meta.story({
  beforeEach: install(() => reviewTransport('seat-2')),
  play: async ({ canvasElement }) => {
    await openTab(within(canvasElement.ownerDocument.body), 'Table review');
  },
});

/* Another player asked; the header and the Table review tab offer Agree and Decline. */
export const VoteOnAReview = meta.story({
  beforeEach: install(() => reviewTransport('seat-2', reviewOf(reviewableSnapshot(), bidding, 'seat-1'))),
});

/* The majority agreed: everyone sees the same public checkpoint, and a seated player can resume play. */
export const Reviewing = meta.story({
  beforeEach: install(() =>
    reviewTransport('seat-2', reviewOf(reviewableSnapshot(), bidding, 'seat-1', ['seat-3', 'seat-4', 'seat-5']))
  ),
});

/* An observer watches the review with the table, without a way to end it. */
export const ReviewingAsObserver = meta.story({
  beforeEach: install(() =>
    reviewTransport(SPECTATOR_SEAT, reviewOf(reviewableSnapshot(), bidding, 'seat-1', ['seat-3', 'seat-4', 'seat-5']))
  ),
});
