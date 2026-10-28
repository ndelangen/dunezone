import { testingPreview } from '@sb/preview';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, session } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { reviewableSnapshot, reviewCheckpoints, reviewOf, reviewTransport } from './review.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Panels/Table review',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const newest = reviewCheckpoints().at(-1)!;
const bidding = reviewCheckpoints().find((checkpoint) => checkpoint.context === 'Turn 1, Bidding')!;
const commands = () => session.transport.messages.filter((message) => message.type === 'command');

/* Asking opens a vote; once the majority agrees, the page shows the checkpoint with no way to act or step, until play resumes. */
export const AskingShowsTheCheckpointToEveryone = meta.story({
  beforeEach: install(() => reviewTransport('seat-2', null, { agreeAfterMs: null })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('button', { name: 'Next phase' }, { timeout: 30_000 })).toBeVisible();
    await openTab(page, 'Table review');
    await userEvent.click(await page.findByRole('button', { name: 'Ask the table to review' }));
    await expect(commands().at(-1)).toMatchObject({ action: { kind: 'review-propose', step: newest.step } });
    const vote = await page.findByRole('group', { name: 'Table review vote' });
    await expect(within(vote).getByRole('button', { name: 'Withdraw' })).toBeVisible();
    (session.transport as ReturnType<typeof reviewTransport>).othersAgree();

    const reviewing = await page.findByRole('group', { name: 'Table review in progress' }, { timeout: 5000 });
    await expect(within(reviewing).getByRole('status')).toHaveTextContent(`Reviewing ${newest.context}.`);
    await waitFor(() => expect(session.transport.messages).toContainEqual({ type: 'history', step: newest.step }));
    for (const name of ['Next phase', 'Earlier phase', 'Return to live']) {
      await expect(page.queryByRole('button', { name })).toBeNull();
    }

    await userEvent.click(within(reviewing).getByRole('button', { name: 'Resume play' }));
    await expect(commands().at(-1)).toMatchObject({ action: { kind: 'review-end' } });
    await expect(await page.findByRole('button', { name: 'Next phase' })).toBeVisible();
    await expect(page.queryByRole('group', { name: 'Table review in progress' })).toBeNull();
  },
});

/* Another player's proposal waits in the header for the viewer's answer. */
export const AnsweringAProposal = meta.story({
  beforeEach: install(() =>
    reviewTransport('seat-2', reviewOf(reviewableSnapshot(), bidding, 'seat-1'), { agreeAfterMs: null })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const vote = await page.findByRole('group', { name: 'Table review vote' }, { timeout: 30_000 });
    await expect(within(vote).getByRole('status')).toHaveTextContent(
      /asks to review Turn 1, Bidding \(1 of 4 agreed\)/
    );
    await userEvent.click(within(vote).getByRole('button', { name: 'Decline' }));
    await expect(commands().at(-1)).toMatchObject({ action: { kind: 'review-ballot', choice: 'decline' } });
    await waitFor(() =>
      expect(within(vote).getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-pressed', 'true')
    );
  },
});

/* An observer sees the review with the table and has nothing to answer or end. */
export const ObserverWatchesAReview = meta.story({
  beforeEach: install(() =>
    reviewTransport(SPECTATOR_SEAT, reviewOf(reviewableSnapshot(), bidding, 'seat-1', ['seat-3', 'seat-4', 'seat-5']))
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const reviewing = await page.findByRole('group', { name: 'Table review in progress' }, { timeout: 30_000 });
    await expect(within(reviewing).getByRole('status')).toHaveTextContent('Reviewing Turn 1, Bidding.');
    await waitFor(() => expect(session.transport.messages).toContainEqual({ type: 'history', step: bidding.step }));
    await expect(page.queryByRole('button', { name: 'Resume play' })).toBeNull();
  },
});
