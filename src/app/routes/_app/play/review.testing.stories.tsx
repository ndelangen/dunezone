import { testingPreview } from '@sb/preview';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, session } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { reviewableSnapshot, reviewCheckpoints, reviewOf, reviewTransport } from './review.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Panels/Mentat recall',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const newest = reviewCheckpoints().at(-1)!;
const bidding = reviewCheckpoints().find((checkpoint) => checkpoint.context === 'Turn 1, Bidding')!;
const commands = () => session.transport.messages.filter((message) => message.type === 'command');

/* The footer opens the frozen hand and the recall's own chat, whose composer sends both lines with Enter. */
export const RecallFooter = meta.story({
  beforeEach: install(() =>
    reviewTransport('seat-2', reviewOf(reviewableSnapshot(), bidding, 'seat-1', ['seat-3', 'seat-4', 'seat-5']))
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const own = await page.findByRole(
      'button',
      { name: /Your recalled hand, you are playing as/ },
      { timeout: 30_000 }
    );
    const compass = page.getByRole('button', { name: /^Controls/ });
    const chat = page.getByRole('button', { name: 'Recall chat' });
    await expect(own.compareDocumentPosition(compass) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(compass.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(page.queryByRole('button', { name: /^Table chat/ })).toBeNull();
    await userEvent.click(own);
    const hand = within(page.getByRole('group', { name: 'Your recalled hand' }));
    await expect(hand.getByLabelText('Spice reserve balance')).toBeVisible();
    await expect(hand.queryByRole('button', { name: /^(?:Drag|Withdraw spice)/ })).toBeNull();
    await userEvent.click(chat);
    const frame = canvasElement.ownerDocument.querySelector('[data-window="recall-chat"]')!;
    await expect(within(frame as HTMLElement).getByRole('img', { name: 'Help' })).toHaveAccessibleDescription(
      'This chat is separate from table chat. All messages and drafts disappear when this recall closes.'
    );
    const composer = page.getByRole('textbox', { name: 'Message' });
    await userEvent.type(composer, 'Earlier');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.type(composer, 'position');
    await expect(composer).toHaveValue('Earlier\nposition');
    await userEvent.keyboard('{Enter}');
    await expect(composer).toHaveValue('');
    await expect(session.transport.messages).toContainEqual(
      expect.objectContaining({
        type: 'conversation-send',
        peerId: expect.stringMatching(/^@recall:/),
        text: 'Earlier\nposition',
      })
    );
    await expect(commands()).toHaveLength(0);
  },
});

/* Asking opens a vote; once the majority agrees, the page shows the shared checkpoint with no way to change game contents, until play resumes. */
export const AskingShowsTheCheckpointToEveryone = meta.story({
  beforeEach: install(() => reviewTransport('seat-2', null, { agreeAfterMs: null })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('button', { name: 'Next phase' }, { timeout: 30_000 })).toBeVisible();
    await openTab(page, 'Mentat recall');
    await userEvent.click(await page.findByRole('button', { name: 'Ask the table to recall' }));
    await expect(commands().at(-1)).toMatchObject({ action: { kind: 'review-propose', step: newest.step } });
    const vote = await page.findByRole('group', { name: 'Mentat recall vote' });
    await expect(within(vote).getByRole('button', { name: 'Withdraw' })).toBeVisible();
    (session.transport as ReturnType<typeof reviewTransport>).othersAgree();

    const reviewing = await page.findByRole('group', { name: 'Mentat recall in progress' }, { timeout: 5000 });
    await waitFor(() =>
      expect(session.transport.messages).toContainEqual(expect.objectContaining({ type: 'history', step: newest.step }))
    );
    for (const name of ['Next phase', 'Earlier phase', 'Return to live']) {
      await expect(page.queryByRole('button', { name })).toBeNull();
    }

    await userEvent.click(within(reviewing).getByRole('button', { name: 'Return to the game' }));
    await expect(commands().at(-1)).toMatchObject({ action: { kind: 'review-end' } });
    await expect(await page.findByRole('button', { name: 'Next phase' })).toBeVisible();
    await expect(page.queryByRole('group', { name: 'Mentat recall in progress' })).toBeNull();
  },
});

/* Another player's proposal waits in the header for the viewer's answer. */
export const AnsweringAProposal = meta.story({
  beforeEach: install(() =>
    reviewTransport('seat-2', reviewOf(reviewableSnapshot(), bidding, 'seat-1'), { agreeAfterMs: null })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const vote = await page.findByRole('group', { name: 'Mentat recall vote' }, { timeout: 30_000 });
    await expect(within(vote).getByRole('status')).toHaveTextContent(
      /asks to recall Turn 1, Bidding \(1 of 4 agreed\)/
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
    await page.findByRole('group', { name: 'Mentat recall in progress' }, { timeout: 30_000 });
    await waitFor(() =>
      expect(session.transport.messages).toContainEqual(
        expect.objectContaining({ type: 'history', step: bidding.step })
      )
    );
    await expect(page.queryByRole('button', { name: 'Return to the game' })).toBeNull();
  },
});

/* Shared seeking changes the recalled checkpoint while game commands stay frozen and personal docks survive the recall. */
export const SharedHistoryKeepsTheLiveLayout = meta.story({
  beforeEach: install(() => reviewTransport('seat-2', null, { agreeAfterMs: null })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('button', { name: 'Next phase' }, { timeout: 30_000 })).toBeVisible();
    await openTab(page, 'Game log');
    await userEvent.click(page.getByRole('button', { name: 'Pin to the bottom right' }));
    const original = canvasElement.ownerDocument.querySelector('[data-window="game-log"]');
    await openTab(page, 'Mentat recall');
    await userEvent.click(page.getByRole('button', { name: 'Ask the table to recall' }));
    (session.transport as ReturnType<typeof reviewTransport>).othersAgree();
    const slider = await page.findByRole('slider', { name: 'Checkpoint' });
    slider.focus();
    await userEvent.keyboard('{Home}');
    await waitFor(() =>
      expect(commands().at(-1)).toMatchObject({ action: { kind: 'review-seek', step: reviewCheckpoints()[0]!.step } })
    );
    await waitFor(() =>
      expect(session.transport.messages).toContainEqual(
        expect.objectContaining({ type: 'history', step: reviewCheckpoints()[0]!.step })
      )
    );
    await userEvent.click(page.getByRole('button', { name: /^Controls/ }));
    await userEvent.type(page.getByRole('textbox', { name: 'Search controls' }), 'Next phase');
    const blocked = page.getByRole('option', { name: /Next phase/ });
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    const count = commands().length;
    await userEvent.keyboard('{Enter}');
    await expect(commands()).toHaveLength(count);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(page.getByRole('button', { name: 'Return to the game' }));
    await expect(await page.findByRole('button', { name: 'Next phase' })).toBeVisible();
    await expect(original).toBeVisible();
    await expect(original).toHaveAttribute('data-side', 'right');
  },
});

/* A later view can clear an old refusal, but it cannot hide retry while the selected checkpoint is still missing. */
export const MissingCheckpointCanRetry = meta.story({
  beforeEach: install(() => {
    const snapshot = reviewableSnapshot();
    const review = reviewOf(snapshot, bidding, 'seat-1', ['seat-3', 'seat-4', 'seat-5']);
    const transport = reviewTransport('seat-2', review);
    const deliver = transport.deliver;
    let refused = false;
    transport.deliver = (message) => {
      if (message.type === 'history' && !refused) {
        refused = true;
        deliver({ type: 'rejected', requestId: message.requestId ?? 'message', message: 'Checkpoint read refused.' });
        queueMicrotask(() => deliver(transport.view({ ...snapshot, review, revision: snapshot.revision + 1 })));
        return;
      }
      deliver(message);
    };
    return transport;
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const fallback = 'The selected checkpoint is not loaded.';
    await expect(await page.findByText(fallback, {}, { timeout: 30_000 })).toBeVisible();
    await userEvent.click(page.getAllByRole('button', { name: 'Retry checkpoint' })[0]!);
    await waitFor(() => expect(page.queryByText(fallback)).toBeNull());
    await expect(page.getByRole('slider', { name: 'Checkpoint' })).toBeVisible();
    await expect(session.transport.messages.filter((message) => message.type === 'history')).toHaveLength(2);
  },
});
