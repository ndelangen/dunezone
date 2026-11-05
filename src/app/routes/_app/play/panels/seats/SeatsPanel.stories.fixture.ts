import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { fn } from 'storybook/test';

import { storyPlayer } from '../../drafting.stories.fixture';
import { playingSnapshot } from '../../product.stories.fixture';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { SeatsPanel } from './SeatsPanel';
import type { SeatsPanelProps } from './SeatsPanel';
import { seatsPanelProps } from './useSeatsPanel';

/*
 * The six-seat game mid-play, seen from seat 2, with seat 3 given up, so a spectator has a seat to ask for.
 * The spectators are the two public profiles the stories keep beside the six players.
 */
const VACATED = 'seat-3';
const PINECONE = storyPlayer(SPECTATOR_SEAT, 'ihaspinecone');
const COOKIE = storyPlayer(SPECTATOR_SEAT, 'cookiemasher');
const watcher = ({ name, avatar, slug }: typeof PINECONE) => ({ name, avatar, slug });

function withWatchers(
  build: (controls: NonNullable<GameSnapshot['controls']>) => Partial<NonNullable<GameSnapshot['controls']>>
): GameSnapshot {
  const snapshot = playingSnapshot('seat-2');
  const controls = snapshot.controls!;
  controls.seats = controls.seats.filter((seat) => seat !== VACATED);
  controls.players = controls.players.filter((player) => player.seat !== VACATED);
  snapshot.controls = { ...controls, seatRequests: [], spectators: [], guests: 0, ...build(controls) };
  return snapshot;
}

/** Nobody watches and nobody asks: five of six seats are taken. */
export const emptySnapshot = () => withWatchers(() => ({}));

/** Two signed-in spectators and three watching signed out, with no request. */
export const watchedSnapshot = () =>
  withWatchers(() => ({ spectators: [watcher(PINECONE), watcher(COOKIE)], guests: 3 }));

/** Only signed-out watchers: the panel counts them and names nobody. */
export const guestsSnapshot = () => withWatchers(() => ({ guests: 2 }));

/** IHasPinecone, watching, asks for the open seat 3. */
export const requestSnapshot = () =>
  withWatchers(() => ({
    spectators: [watcher(PINECONE), watcher(COOKIE)],
    guests: 1,
    seatRequests: [{ id: 'seat-request-1', requesterName: PINECONE.name, seat: VACATED }],
  }));

/** The panel's props as the table hands them for this snapshot, seen from the given seat, with a spied Approve. */
export function seatsProps(snapshot: GameSnapshot = watchedSnapshot(), seat = 'seat-2'): SeatsPanelProps {
  return seatsPanelProps(tableOf(snapshot, seat), fn());
}

/** The request as an observer sees it: who asks for what, and no action at all. */
export const observerProps = () => seatsProps(requestSnapshot(), SPECTATOR_SEAT);

/** The request as the spectator who sent it sees it. */
export function ownRequestProps(): SeatsPanelProps {
  const snapshot = requestSnapshot();
  snapshot.controls!.seatRequests = snapshot.controls!.seatRequests.map((request) => ({ ...request, own: true }));
  return seatsProps(snapshot, SPECTATOR_SEAT);
}

export const seatsPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.seats),
  component: SeatsPanel,
  args: seatsProps(),
};
