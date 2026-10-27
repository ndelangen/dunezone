import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { fn } from 'storybook/test';

import { alliancesSnapshot, faction, VIEWER } from '../../alliances.stories.fixture';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { AlliancesPanel } from './AlliancesPanel';
import type { AlliancesPanelProps } from './AlliancesPanel';
import { allianceRows } from './useAlliancesPanel';

/** The panel's props as the table hands them for this snapshot, seen from the viewer's seat, with spied actions. */
export function alliancesProps(snapshot: GameSnapshot = alliancesSnapshot(), seat = VIEWER): AlliancesPanelProps {
  return { rows: allianceRows(tableOf(snapshot, seat)), disabled: false, onAction: fn() };
}

/** The panel as an observer sees it: every alliance, and no actions at all. */
export function observerProps() {
  return alliancesProps(alliancesSnapshot(), SPECTATOR_SEAT);
}

/** The viewer has offered seat 3 an alliance, which waits on seat 3's answer. */
export function offeringSnapshot() {
  const snapshot = alliancesSnapshot();
  snapshot.alliances!.offers.push({ from: faction(snapshot, VIEWER), to: faction(snapshot, 'seat-3'), at: 0, id: 1 });
  return snapshot;
}

/** The viewer allied with seat 4, so seat 4's row offers to break it. */
export function alliedSnapshot() {
  const snapshot = alliancesSnapshot();
  snapshot.alliances = {
    groups: [{ members: [faction(snapshot, VIEWER), faction(snapshot, 'seat-4')], mark: 0 }],
    offers: [],
  };
  return snapshot;
}

/** The game over: who was allied still shows, and nobody can change it. */
export function finishedSnapshot() {
  const snapshot = alliancesSnapshot();
  snapshot.stage = 'finished';
  return snapshot;
}

export const alliancesPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.alliances),
  component: AlliancesPanel,
  args: alliancesProps(),
};
