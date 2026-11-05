import preview from '@sb/preview';
import { expect } from 'storybook/test';

import {
  emptySnapshot,
  guestsSnapshot,
  observerProps,
  ownRequestProps,
  requestSnapshot,
  seatsPanelMeta,
  seatsProps,
} from './SeatsPanel.stories.fixture';

/*
 * The Seats & spectators window on its own, as seat 2 sees a six-seat game mid-play with seat 3 given up:
 * how the seats stand, any spectator's request for the open seat, and who is watching. Each story shows one state.
 */
const meta = preview.meta({ ...seatsPanelMeta, title: 'Play/Panels/Seats & spectators' });

/** Two signed-in spectators by name and avatar, and three more watching signed out, only counted. */
export const Watched = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Spectators · 5')).toBeVisible();
    await expect(canvas.getByText('3 more watching signed out')).toBeVisible();
  },
});

/** IHasPinecone asks for seat 3: the request leads the window, with the one Approve a player needs. */
export const SeatRequested = meta.story({
  args: seatsProps(requestSnapshot()),
  parameters: { panelFrame: 'centre' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Seat requests' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Approve IHasPinecone' })).toBeVisible();
  },
});

/** An observer sees the same request and who is watching, and no buttons at all, not even greyed-out ones. */
export const Observer = meta.story({
  args: observerProps(),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Seat requests' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Approve/ })).toBeNull();
  },
});

/** The spectator who asked sees their own request marked as theirs, with nothing to approve. */
export const OwnRequest = meta.story({
  args: ownRequestProps(),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/\(you\)/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Approve/ })).toBeNull();
  },
});

/** Only signed-out watchers: they are counted, and nobody is named. */
export const SignedOutOnly = meta.story({
  args: seatsProps(guestsSnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('2 watching signed out')).toBeVisible();
  },
});

/** Nobody is watching. */
export const NobodyWatching = meta.story({
  args: seatsProps(emptySnapshot()),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nobody is watching.')).toBeVisible();
  },
});
