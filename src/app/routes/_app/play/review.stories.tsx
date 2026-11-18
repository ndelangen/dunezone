import preview from '@sb/preview';
import { TABLE_PHASES } from '@shared/play/phases';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { agreedBattle } from './panels/battles/BattleHistoryPanel.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';
import {
  reviewableSnapshot,
  reviewCheckpoints,
  reviewOf,
  reviewTransport,
  withSettledBattle,
} from './review.stories.fixture';

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
const finishedMovement = reviewCheckpoints('finished').find(
  (checkpoint) => checkpoint.label === 'Shipment and Movement'
)!;

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

/* The game is over: any player picks a checkpoint of the whole game and the table recalls it together, with no vote. */
export const AfterTheGame = meta.story({
  beforeEach: install(() => reviewTransport('seat-2', null, { stage: 'finished' })),
  play: async ({ canvasElement }) => {
    await openTab(within(canvasElement.ownerDocument.body), 'Mentat recall');
  },
});

/* A recall after the game: everyone sees the same checkpoint, any player moves it for everyone or ends it. */
export const RecallingAfterTheGame = meta.story({
  beforeEach: install(() =>
    reviewTransport('seat-2', reviewOf(reviewableSnapshot('seat-2', null, 'finished'), finishedMovement, 'seat-1'), {
      stage: 'finished',
    })
  ),
});

/* Recalling the checkpoint saved right after a battle settled shows that battle's reveal on the table again, read-only (#2985). */
export const RecallingASettledBattle = meta.story({
  beforeEach: install(() => {
    const settled = withSettledBattle(reviewCheckpoints('finished')).find(
      (checkpoint) => checkpoint.moment === 'battle'
    )!;
    return reviewTransport('seat-2', reviewOf(reviewableSnapshot('seat-2', null, 'finished'), settled, 'seat-1'), {
      stage: 'finished',
      settledBattle: agreedBattle().results[0],
    });
  }),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    /* The table's own reveal comes back where the battle was fought: the winner's call under its wheel, and nothing to press. */
    await expect(await body.findByText('Left side won', {}, { timeout: 5000 })).toBeVisible();
    for (const name of ['No winner', 'Left side won', 'Right side won', 'Resolve battle']) {
      await expect(body.queryByRole('button', { name })).toBeNull();
    }
  },
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
