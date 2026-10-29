import preview from '@sb/preview';
import { TABLE_PHASES } from '@shared/play/phases';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';
import { reviewableSnapshot, reviewCheckpoints, reviewOf, reviewTransport } from './review.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Mentat recall',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const movement = reviewCheckpoints().find((checkpoint) => checkpoint.label === 'Shipment and Movement')!;
const bidding = reviewCheckpoints().find((checkpoint) => checkpoint.context === 'Turn 1, Bidding')!;

/* A seated player asks the table to look back; the others agree a moment later and the checkpoint shows for everyone. */
export const AskForARecall = meta.story({
  beforeEach: install(() => reviewTransport('seat-2')),
  play: async ({ canvasElement }) => {
    await openTab(within(canvasElement.ownerDocument.body), 'Mentat recall');
  },
});

/* Another player asked; the header and the Mentat recall panel offer Agree and Decline. */
export const VoteOnARecall = meta.story({
  beforeEach: install(() => reviewTransport('seat-2', reviewOf(reviewableSnapshot(), bidding, 'seat-1'))),
});

/* The majority agreed: everyone sees the same public checkpoint, and a seated player can resume play. */
export const Running = meta.story({
  beforeEach: install(() =>
    reviewTransport('seat-2', reviewOf(reviewableSnapshot(), movement, 'seat-1', ['seat-3', 'seat-4', 'seat-5']))
  ),
});

/* An observer watches the review with the table, without a way to end it. */
export const Observer = meta.story({
  beforeEach: install(() =>
    reviewTransport(SPECTATOR_SEAT, reviewOf(reviewableSnapshot(), bidding, 'seat-1', ['seat-3', 'seat-4', 'seat-5']))
  ),
});

/* Shipment and Movement with the first faction done: the phase chip shows every faction's token in turn order, the first faded as done and the second ringed as up now, for any seated player to mark done, which saves a checkpoint. */
export const ShipmentAndMovementTurns = meta.story({
  beforeEach: install(() => {
    const snapshot = playingSnapshot('seat-2');
    snapshot.phase = TABLE_PHASES.findIndex((phase) => phase.id === 'shipment-and-movement');
    snapshot.movement = { done: [snapshot.roster!.seats[0]!.faction!.id] };
    return productTransport('seat-2', snapshot);
  }),
});
