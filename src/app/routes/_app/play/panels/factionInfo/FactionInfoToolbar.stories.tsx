import preview from '@sb/preview';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect } from 'storybook/test';

import { playingSnapshot, swappingSnapshot } from '../../product.stories.fixture';
import { alliedSnapshot, incomingSnapshot } from '../alliances/AlliancesPanel.stories.fixture';
import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { factionInfoArgs, removalSnapshot } from './FactionInfoPanel.stories.fixture';
import { FactionInfoToolbar } from './FactionInfoToolbar';
import type { FactionInfoToolbarProps } from './FactionInfoToolbar';
import { withTechTokens } from './HeldTechTokens.stories.fixture';

/* The toolbar's props as the Faction info hands them for one seat, seen from the viewer's seat. */
function toolbarArgs(...args: Parameters<typeof factionInfoArgs>): FactionInfoToolbarProps {
  const { header, trade, vote, onBallot } = factionInfoArgs(...args);
  return {
    page: header.page,
    removal: header.removal,
    techTokens: header.techTokens,
    allies: header.alliance?.allies,
    alliance: header.alliance?.action,
    trade,
    ballot: vote && 'choice' in vote.ballot ? { choice: vote.ballot.choice, cast: onBallot } : null,
  };
}

/* Seats being traded, with the trade state the story is about. */
function trading(change: (swapping: NonNullable<ReturnType<typeof swappingSnapshot>['swapping']>) => void) {
  const snapshot = swappingSnapshot();
  change(snapshot.swapping!);
  return toolbarArgs(snapshot);
}

/*
 * The row of icon actions under a seat's Faction info header, as seat 2 sees it, in the Faction info window.
 * Each story shows one action's state; the panel's stories show the window around it.
 */
const meta = preview.meta({
  ...panelMeta(PANEL_WINDOWS.factionInfo),
  title: 'Play/Panels/Faction info/Toolbar',
  component: FactionInfoToolbar,
  args: toolbarArgs(playingSnapshot()),
});

/** Another player mid-play: the faction page on the left, then Offer alliance and the red Start removal vote. */
export const AnotherPlayer = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Offer alliance' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Start removal vote' })).toBeVisible();
  },
});

/** A removal vote that cannot start yet says why on hover. */
export const RemovalUnavailable = meta.story({
  args: {
    removal: { start: () => {}, disabledReason: 'Removal requires at least three players.' },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Start removal vote' })).toHaveAttribute('aria-disabled', 'true');
  },
});

/** Their faction offers the viewer an alliance: the green Accept alliance. */
export const AllianceOffered = meta.story({
  args: toolbarArgs(incomingSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Accept alliance' })).toBeVisible();
  },
});

/** The viewer's ally: the viewer's token as its ally, then the red Break alliance. */
export const Ally = meta.story({
  args: toolbarArgs(alliedSnapshot(), 'seat-4'),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'House Harkonnen' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Break alliance' })).toBeVisible();
  },
});

/** A vote to remove the player is open and the viewer voted Remove: Remove stays pressed beside Keep and Withdraw. */
export const BallotCast = meta.story({
  args: toolbarArgs(removalSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.queryByRole('button', { name: 'Start removal vote' })).toBeNull();
  },
});

/** The viewer has not voted yet, so there is nothing to withdraw. */
export const BallotUncast = meta.story({
  args: {
    ballot: { choice: null, cast: () => {} },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Withdraw' })).toHaveAttribute('aria-disabled', 'true');
  },
});

/** While seats are traded: Offer trade, and no alliance yet. */
export const Trade = meta.story({
  args: toolbarArgs(swappingSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /^Offer trade to/ })).toBeVisible();
  },
});

/** Their seat offers the viewer a trade: the green Accept trade. */
export const TradeOffered = meta.story({
  args: trading((swapping) => {
    swapping.offers = [{ id: 'offer-one', origin: 'seat-1', target: 'seat-2', order: 1 }];
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /^Accept trade from/ })).toBeVisible();
  },
});

/** The viewer's offer waits: the pressed hourglass takes it back. */
export const TradeOffering = meta.story({
  args: trading((swapping) => {
    swapping.offers = [{ id: 'offer-one', origin: 'seat-2', target: 'seat-1', order: 1 }];
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /^Cancel offer to/ })).toHaveAttribute('aria-pressed', 'true');
  },
});

/** Their player is ready, so they take no trades, and the action says so on hover. */
export const TradeWhileTheyAreReady = meta.story({
  args: trading((swapping) => {
    swapping.ready = ['seat-1'];
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /^Offer trade to/ })).toHaveAttribute('aria-disabled', 'true');
  },
});

/** An observer: the faction page only, and no action at all. */
export const Observer = meta.story({
  args: toolbarArgs(playingSnapshot(), 'seat-1', SPECTATOR_SEAT),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('link')).toHaveLength(1);
    await expect(canvas.queryByRole('button')).toBeNull();
  },
});

/** The viewer's ally holds two tech tokens: their gears lead the right, then the ally's token and Break alliance. */
export const TechTokensBesideAllies = meta.story({
  args: toolbarArgs(withTechTokens(alliedSnapshot(), { 'seat-4': ['heighliners', 'tleilaxu-tanks'] }), 'seat-4'),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('list', { name: 'Tech tokens held' })).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'House Harkonnen' })).toBeVisible();
  },
});

/** An observer sees who holds which tech token too, with still no action. */
export const ObserverSeesTechTokens = meta.story({
  args: toolbarArgs(withTechTokens(playingSnapshot()), 'seat-1', SPECTATOR_SEAT),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2);
    await expect(canvas.queryByRole('button')).toBeNull();
  },
});
