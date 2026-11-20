import preview from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { factions } from '../../drafting.stories.fixture';
import { BidderPrototype } from './BidderPrototype';
import type { PrototypeFaction } from './BidderPrototype';

/*
 * The bidding prototypes of #2983: a playable round per story, against four factions that bid on their own.
 * Harkonnen is you; the bidder starts at a different faction on each card.
 */
const FACTIONS: Record<string, PrototypeFaction> = Object.fromEntries(
  factions.map(({ slug, data }) => [
    slug,
    { name: data.name, token: { emblem: data.emblem, background: data.background } },
  ])
);

const meta = preview.meta({
  component: BidderPrototype,
  title: 'Play/Bidding/Prototypes',
  args: { factions: FACTIONS },
  parameters: { layout: 'centered', chromatic: { disableSnapshot: true } },
  globals: { motion: 'on' },
});

/** Today's bidder: I raises by one and keeps the turn, P hands it on. */
export const Today = meta.story({
  args: { variant: 'today' },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Today')).toBeVisible());
  },
});

/** +1, +2 and +5, each a whole turn. */
export const QuickRaises = meta.story({
  args: { variant: 'quick' },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Quick raises')).toBeVisible());
  },
});

/** ↑ and ↓ set the amount, Enter bids it. */
export const SetAnAmount = meta.story({
  args: { variant: 'stepper' },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Set an amount, then bid')).toBeVisible());
  },
});

/** Type the amount, or pick one of the next five. */
export const TypeTheAmount = meta.story({
  args: { variant: 'typed' },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Type the amount')).toBeVisible());
  },
});

/** Today's bidder with "Out for this card" and "Stay in up to". */
export const AutoPass = meta.story({
  args: { variant: 'autoPass' },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Today, with auto-pass')).toBeVisible());
  },
});

/** The stepper, the quick raises and the auto-pass together. */
export const AllTogether = meta.story({
  args: { variant: 'combined' },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('All together')).toBeVisible());
  },
});
