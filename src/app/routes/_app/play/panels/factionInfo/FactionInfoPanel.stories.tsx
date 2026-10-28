import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { playingSnapshot } from '../../product.stories.fixture';
import {
  factionInfoArgs,
  factionInfoPanelMeta,
  observerArgs,
  removalSnapshot,
  vacantSnapshot,
} from './FactionInfoPanel.stories.fixture';

/*
 * The Faction info window on its own, for one seat of a six-seat game mid-play, as seat 2 sees it:
 * who sits there, their faction and alliance, what the faction starts with, and any vote against the player.
 * The seat's requests and trade have their own stories with the table.
 */
const meta = preview.meta({ ...factionInfoPanelMeta, title: 'Play/Panels/Faction info' });

/** Twaffle's House Atreides in seat 1: its page, its alliance, and its leaders, with the advantages open. */
export const AnotherPlayer = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText('House Atreides · Seat 1')).toBeVisible();
  },
});

/** The viewer's own seat, marked as theirs, with no removal vote to start. */
export const OwnSeat = meta.story({
  args: factionInfoArgs(playingSnapshot(), 'seat-2'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/\(you\)$/)).toBeVisible();
  },
});

/** An open seat, named by its faction. */
export const OpenSeat = meta.story({
  args: factionInfoArgs(vacantSnapshot(), 'seat-6'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Seat 6')).toBeVisible();
  },
});

/** A game that captured no faction sheet: the seat's player and alliance only. */
export const WithoutTheFactionSheet = meta.story({
  args: factionInfoArgs(playingSnapshot(), 'seat-1', 'seat-2', { captured: false }),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'Advantages' })).toBeNull();
  },
});

/** A vote to remove Twaffle, which the viewer has voted to remove. */
export const RemovalVote = meta.story({
  args: factionInfoArgs(removalSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-pressed', 'true');
  },
});

/** The vote as its target sees it: the ballots, and no vote of their own. */
export const RemovalVoteOnYou = meta.story({
  args: factionInfoArgs(removalSnapshot(), 'seat-1', 'seat-1'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('You cannot vote on your own removal.')).toBeVisible();
  },
});

/** An observer reads the seat, with no action at all. */
export const Observer = meta.story({
  args: observerArgs(),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: /^(Offer alliance|Start removal vote)$/ })).toBeNull();
  },
});
