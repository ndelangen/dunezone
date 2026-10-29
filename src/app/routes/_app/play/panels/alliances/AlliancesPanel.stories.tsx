import preview from '@sb/preview';
import { expect } from 'storybook/test';

import {
  alliancesPanelMeta,
  alliancesProps,
  alliedSnapshot,
  finishedSnapshot,
  incomingSnapshot,
  observerProps,
  offeringSnapshot,
  othersAlliedSnapshot,
} from './AlliancesPanel.stories.fixture';

/*
 * The Alliances window on its own, as seat 2 sees a six-seat game mid-play: every other faction by its token,
 * its allies and status, and the one action the viewer has about it. Each story shows one alliance state.
 */
const meta = preview.meta({ ...alliancesPanelMeta, title: 'Play/Panels/Alliances' });

const ACTION = /Offer alliance|Accept alliance|Withdraw alliance offer|Break alliance/;

/** Nobody is allied yet: the viewer's own faction has no row, and every other faction can be offered an alliance. */
export const NoAlliances = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/House Harkonnen/)).toBeNull();
    await expect(canvas.getAllByRole('button', { name: 'Offer alliance' })).toHaveLength(5);
  },
});

/** Seat 1 offers the viewer an alliance, which its row accepts; there is no way to decline it. */
export const IncomingOffer = meta.story({
  args: alliancesProps(incomingSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Offers you an alliance')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Decline/ })).toBeNull();
  },
});

/** The viewer's offer to seat 3 waits: its row reads Offering…, and the pressed hourglass takes the offer back. */
export const Offering = meta.story({
  args: alliancesProps(offeringSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Offering…')).toBeVisible();
  },
});

/** Seats 4 and 5 are allied with each other, so neither can be offered an alliance; each names its ally by token. */
export const OthersAllied = meta.story({
  args: alliancesProps(othersAlliedSnapshot()),
  play: async ({ canvas }) => {
    const allied = canvas.getByText('Allied with Fremen').parentElement!;
    await expect(allied.querySelector('[role="img"][aria-label="Fremen"]')).not.toBeNull();
    await expect(canvas.getAllByRole('button', { name: 'Offer alliance' })).toHaveLength(3);
  },
});

/** The viewer is allied with seat 4: the ally's row breaks it, and no faction can be offered one until it is broken. */
export const Allied = meta.story({
  args: alliancesProps(alliedSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Your ally')).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: ACTION })).toHaveLength(1);
  },
});

/** The game is finished: who was allied still shows, and no row has an action. */
export const Finished = meta.story({
  args: alliancesProps(finishedSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Allied with Fremen')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: ACTION })).toBeNull();
  },
});

/** An observer holds no faction: every faction and alliance shows, and no buttons at all, not even greyed-out ones. */
export const Observer = meta.story({
  args: observerProps(),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText(/ · /)).toHaveLength(6);
    await expect(canvas.queryByRole('button', { name: ACTION })).toBeNull();
  },
});
