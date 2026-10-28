import type { AllianceState } from '@shared/play/alliances';
import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { fn } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { faction, VIEWER } from '../../alliances.stories.fixture';
import { playingSnapshot } from '../../product.stories.fixture';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { AlliancesPanel } from './AlliancesPanel';
import type { AlliancesPanelProps } from './AlliancesPanel';
import { allianceRows } from './useAlliancesPanel';

/*
 * Each snapshot holds one alliance state and nothing else, so a story shows only the state it is named for:
 * the six-seat game mid-play, seen from seat 2, with its alliances built from the seats' factions.
 */
function withAlliances(build: (seat: (name: string) => string) => Partial<AllianceState>): GameSnapshot {
  const snapshot = playingSnapshot(VIEWER);
  snapshot.alliances = { groups: [], offers: [], ...build((name) => faction(snapshot, name)) };
  return snapshot;
}

/** Nobody is allied and no offer is out: every other faction can be offered an alliance. */
const aloneSnapshot = () => withAlliances(() => ({}));

/** Seat 1 has offered the viewer an alliance. */
export const incomingSnapshot = () =>
  withAlliances((seat) => ({ offers: [{ from: seat('seat-1'), to: seat(VIEWER), at: STORYBOOK_NOW, id: 0 }] }));

/** The viewer has offered seat 3 an alliance, which waits on seat 3's answer. */
export const offeringSnapshot = () =>
  withAlliances((seat) => ({ offers: [{ from: seat(VIEWER), to: seat('seat-3'), at: STORYBOOK_NOW, id: 0 }] }));

/** Seats 4 and 5 are allied with each other, so neither can be offered an alliance. */
export const othersAlliedSnapshot = () =>
  withAlliances((seat) => ({ groups: [{ members: [seat('seat-4'), seat('seat-5')], mark: 0 }] }));

/** The viewer allied with seat 4, so seat 4's row offers to break it. */
export const alliedSnapshot = () =>
  withAlliances((seat) => ({ groups: [{ members: [seat(VIEWER), seat('seat-4')], mark: 0 }] }));

/** Every kind of row at once, for the test that drives each action: seat 1 offers, the viewer offers seat 3, seats 4 and 5 are allied, and seat 6 stands alone. */
export const everyActionSnapshot = () =>
  withAlliances((seat) => ({
    groups: [{ members: [seat('seat-4'), seat('seat-5')], mark: 0 }],
    offers: [
      { from: seat('seat-1'), to: seat(VIEWER), at: STORYBOOK_NOW, id: 0 },
      { from: seat(VIEWER), to: seat('seat-3'), at: STORYBOOK_NOW, id: 1 },
    ],
  }));

/** The game over with seats 4 and 5 allied: who was allied still shows, and nobody can change it. */
export function finishedSnapshot() {
  const snapshot = othersAlliedSnapshot();
  snapshot.stage = 'finished';
  return snapshot;
}

/** The panel's props as the table hands them for this snapshot, seen from the viewer's seat, with spied actions. */
export function alliancesProps(snapshot: GameSnapshot = aloneSnapshot(), seat = VIEWER): AlliancesPanelProps {
  return { rows: allianceRows(tableOf(snapshot, seat)), disabled: false, onAction: fn() };
}

/** The panel as an observer sees it, with seats 4 and 5 allied: every faction, and no actions at all. */
export const observerProps = () => alliancesProps(othersAlliedSnapshot(), SPECTATOR_SEAT);

/** A faction's id at the stories' table, by its seat. */
export const seatFaction = (name: string) => faction(aloneSnapshot(), name);

export const alliancesPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.alliances),
  component: AlliancesPanel,
  args: alliancesProps(),
};
