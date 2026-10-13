import preview from '@sb/preview';
import { idleBidding } from '@shared/play/bidding';
import { STANDARD_PHASES } from '@shared/play/phases';

import { BiddingClockPrototypeProvider } from './biddingClockPrototype';
import { gameMeta, install } from './game.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Playing/Bidding clock prototype',
  decorators: [
    ...gameMeta.decorators,
    (Story) => (
      <BiddingClockPrototypeProvider>
        <Story />
      </BiddingClockPrototypeProvider>
    ),
  ],
});

export const ExistingBidder = meta.story({
  beforeEach: install(() => {
    const snapshot = playingSnapshot('seat-2');
    snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === 'bidding');
    snapshot.bidding = {
      ...idleBidding(20),
      stage: 'open',
      round: 1,
      opener: 'house-atreides',
      turn: 'house-harkonnen',
      bid: { factionId: 'house-atreides', amount: 3 },
      deadline: null,
    };
    return productTransport('seat-2', snapshot);
  }),
});
