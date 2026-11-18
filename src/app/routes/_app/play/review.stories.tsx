import preview from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
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
  settledBattleCheckpoint,
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
    const [newest] = agreedBattle().results;
    /* An earlier battle the table still keeps, behind the one this checkpoint settled, which the right side won. */
    const earlier = { ...newest!, id: 'earlier-battle', territory: 'Carthag', outcome: 'right' as const };
    return reviewTransport(
      'seat-2',
      reviewOf(reviewableSnapshot('seat-2', null, 'finished'), settledBattleCheckpoint('finished'), 'seat-1'),
      { stage: 'finished', settledBattles: [newest!, earlier] }
    );
  }),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    /* The table's own reveal comes back where the battle was fought: the winner's call under its wheel, and nothing to press. */
    const call = await body.findByText('Left side won', {}, { timeout: 5000 });
    finishTransitions(call);
    await expect(call).toBeVisible();
    /* The newest settled battle is the one this checkpoint saved, not an earlier one the table still keeps. */
    await expect(body.queryByText('Right side won')).toBeNull();
    /* The pieces each side played stay on its wheel, though the table no longer marks them as part of the battle. */
    await expect(body.queryAllByText('No leader')).toHaveLength(0);
    for (const name of [/Feyd Rautha/i, /Lady Jessica/i, /Crysknife/i]) {
      await expect(await body.findByRole('img', { name })).toBeInTheDocument();
    }
    for (const name of ['No winner', 'Left side won', 'Right side won', 'Resolve battle']) {
      await expect(body.queryByRole('button', { name })).toBeNull();
    }
  },
});

/* A recalled battle that settled with no winner says so once, between the wheels, since the table keeps no side's own call. */
export const RecallingABattleWithNoWinner = meta.story({
  beforeEach: install(() => {
    const [result] = agreedBattle().results;
    return reviewTransport(
      'seat-2',
      reviewOf(reviewableSnapshot('seat-2', null, 'finished'), settledBattleCheckpoint('finished'), 'seat-1'),
      { stage: 'finished', settledBattles: [{ ...result!, outcome: 'none' }] }
    );
  }),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const call = await body.findByText('No winner', {}, { timeout: 5000 });
    finishTransitions(call);
    await expect(call).toBeVisible();
    await expect(body.getAllByText('No winner')).toHaveLength(1);
    await expect(body.queryByText(/side won$/)).toBeNull();
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
