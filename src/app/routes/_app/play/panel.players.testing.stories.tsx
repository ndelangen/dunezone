import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { seatFactionsResolve } from '@db/storybook';

import { openFactionInfo, WAIT } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, removalSnapshot, session } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { productTransport, playingSnapshot } from './product.stories.fixture';

/* The mark on a player's token in the chat bar, while a vote or a seat request waits on them. */
function attentionOn(page: ReturnType<typeof within>, player: string) {
  return within(page.getByRole('navigation', { name: 'Chats' }))
    .getByRole('button', { name: new RegExp(`^${player}`) })
    .querySelector('[data-attention]');
}

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Panels/Players',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** A player's public information in their window: the faction's name opens its page, with the leaders it starts with, in a new browser tab. */
export const Info = meta.story({
  decorators: [seatFactionsResolve],
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openFactionInfo(canvasElement, 'Twaffle');
    const link = await page.findByRole('link', { name: 'Open the House Atreides page in a new tab' }, WAIT);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('href', '/factions/house-atreides');
    await expect(page.findByText('House Atreides · Seat 1')).resolves.toBeVisible();
    await expect(page.findByRole('button', { name: 'Advantages' }, WAIT)).resolves.toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(page.getByRole('button', { name: 'Setup' })).toHaveAttribute('aria-expanded', 'false');
  },
});

/** A vote to remove a player, cast from that player's Info. */
export const RemovalVote = meta.story({
  beforeEach: install(() => productTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openFactionInfo(canvasElement, 'Twaffle');
    await expect(page.findByRole('button', { name: 'Keep' }, WAIT)).resolves.toBeVisible();
  },
});

export const RemovalVoting = meta.story({
  beforeEach: install(() => productTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openFactionInfo(canvasElement, 'Twaffle');
    /* The token in the chat bar carries a mark while the vote stands, and says so in its name. */
    await expect(attentionOn(page, 'Twaffle')).not.toBeNull();
    await expect(
      within(page.getByRole('navigation', { name: 'Chats' })).getByRole('button', { name: /^Twaffle.*removal vote/u })
    ).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Withdraw' }));
    await expect(lastCommand()).toMatchObject({
      action: { kind: 'removal-ballot', voteId: 'removal-12', choice: null },
    });
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    await expect(lastCommand()).toMatchObject({ action: { kind: 'removal-ballot', choice: 'keep' } });
  },
});

export const RemovalResolution = meta.story({
  beforeEach: install(() => {
    return productTransport('seat-2', removalSnapshot(), {
      logEntries: {
        audit: [
          {
            sequence: 1,
            class: 'vote',
            text: 'Twaffle keeps seat 1: Thialfi and Fectumbra voted keep; Erickenneth, Ridwan and Argelius did not vote.',
            context: 'Setup, Traitor selection',
            at: 1,
          },
        ],
      },
    });
  }),
  play: async ({ canvasElement }) => {
    const page = await openFactionInfo(canvasElement, 'Twaffle');
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    const command = lastCommand();
    await expect(command).toMatchObject({ action: { kind: 'removal-ballot', choice: 'keep' } });
    const resolved = playingSnapshot();
    resolved.removalVotes = [];
    resolved.revision += 1;
    session.transport.deliver(session.transport.view(resolved, command!.commandId));
    await waitFor(() => expect(page.queryByRole('heading', { name: 'Remove Twaffle?' })).toBeNull());
    await expect(page.queryByRole('heading', { name: 'Remove Twaffle?' })).toBeNull();
    await expect(attentionOn(page, 'Twaffle')).toBeNull();
    await openTab(page, 'Audit');
    await expect(page.findByText(/Twaffle keeps seat 1/)).resolves.toBeVisible();
  },
});

export const RemovalRejected = meta.story({
  beforeEach: install(() => productTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openFactionInfo(canvasElement, 'Twaffle');
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    session.transport.deliver({
      type: 'rejected',
      requestId: lastCommand()!.commandId,
      message: 'The vote changed. Try again.',
    });
    await expect(page.findByText('The vote changed. Try again.')).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-pressed', 'true');
  },
});
