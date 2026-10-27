import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { playingSnapshot } from '../../product.stories.fixture';
import { factionInfoArgs, factionInfoPanelMeta, actions, removalSnapshot } from './FactionInfoPanel.stories.fixture';

const meta = testingPreview.meta({ ...factionInfoPanelMeta, title: 'Play/Panels/Faction info' });

/** Each ballot is cast for the vote, and Withdraw takes the viewer's back. */
export const Votes = meta.story({
  args: factionInfoArgs(removalSnapshot()),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Keep' }));
    await expect(actions.onBallot).toHaveBeenLastCalledWith('removal-12', 'keep');
    await userEvent.click(canvas.getByRole('button', { name: 'Withdraw' }));
    await expect(actions.onBallot).toHaveBeenLastCalledWith('removal-12', null);
  },
});

/** Start removal vote puts the seat's player to a vote. */
export const StartsARemovalVote = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Start removal vote' }));
    await expect(actions.onStartRemoval).toHaveBeenLastCalledWith('seat-1');
  },
});

/** Offer alliance offers the seat's faction an alliance. */
export const OffersAnAlliance = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Offer alliance' }));
    const atreides = playingSnapshot().roster!.seats[0]!.faction!.id;
    await expect(actions.onAlliance).toHaveBeenLastCalledWith(atreides, 'alliance-offer');
  },
});
