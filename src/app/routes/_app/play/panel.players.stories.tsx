import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { seatFactionsResolve } from '@db/storybook';

import { openPlayer, WAIT } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, removalSnapshot, session, seatPopover } from './game.stories.fixture';
import { openTab, battleStory } from './playing.stories.fixture';
import { productTransport, playingSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Panels/Players',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/** A player's public information beside the controls: the faction's name opens its page, with the leaders it starts with, in a new tab. */
export const Info = meta.story({
  decorators: [seatFactionsResolve],
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPlayer(canvasElement, 'Twaffle', 'Info');
    const link = await page.findByRole('link', { name: 'View House Atreides (opens in a new tab)' }, WAIT);
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

/** A vote to remove a player, cast from that player's Info tab. */
export const RemovalVote = meta.story({
  beforeEach: install(() => productTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPlayer(canvasElement, 'Twaffle', 'Info');
    await expect(page.findByRole('button', { name: 'Keep' }, WAIT)).resolves.toBeVisible();
  },
});

export const RemovalVoting = meta.story({
  beforeEach: install(() => productTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('tab', { name: 'Twaffle, removal vote in progress' }));
    await expect(page.getByRole('tab', { name: 'Twaffle, removal vote in progress' })).toBeVisible();
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
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('tab', { name: 'Twaffle, removal vote in progress' }));
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    const command = lastCommand();
    await expect(command).toMatchObject({ action: { kind: 'removal-ballot', choice: 'keep' } });
    const resolved = playingSnapshot();
    resolved.removalVotes = [];
    resolved.revision += 1;
    session.transport.deliver(session.transport.view(resolved, command!.commandId));
    await waitFor(() => expect(page.queryByRole('heading', { name: 'Remove Twaffle?' })).toBeNull());
    await expect(page.queryByRole('heading', { name: 'Remove Twaffle?' })).toBeNull();
    await expect(page.queryByRole('tab', { name: 'Twaffle, removal vote in progress' })).toBeNull();
    await openTab(page, 'Game log');
    await userEvent.click(await page.findByRole('tab', { name: 'Audit' }));
    await expect(page.findByText(/Twaffle keeps seat 1/)).resolves.toBeVisible();
  },
});

export const RemovalRejected = meta.story({
  beforeEach: install(() => productTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('tab', { name: 'Twaffle, removal vote in progress' }));
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    session.transport.deliver({
      type: 'rejected',
      requestId: lastCommand()!.commandId,
      message: 'The vote changed. Try again.',
    });
    const publicState = within(canvasElement.ownerDocument.getElementById('player-public-state')!);
    await expect(publicState.findByText('The vote changed. Try again.')).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-pressed', 'true');
  },
});

/** A spectator of a full game reads that from the header's seat action; the dock keeps its height for the tabs. */
export const FullGameSpectatorSeat = meta.story({
  beforeEach: install(() => productTransport('neutral', battleStory('revealed', true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const seat = await seatPopover(canvasElement, 'You are watching');
    await expect(seat().findByText('All 6 seats are taken')).resolves.toBeVisible();
    await expect(seat().queryByRole('button', { name: /^Request/ })).toBeNull();
    const dock = canvasElement.ownerDocument.querySelector<HTMLElement>('.seated-controls-panel')!;
    await expect(within(dock).queryByRole('region', { name: 'You are watching' })).toBeNull();
    await expect(page.getAllByRole('region', { name: 'You are watching' })).toHaveLength(1);
  },
});
