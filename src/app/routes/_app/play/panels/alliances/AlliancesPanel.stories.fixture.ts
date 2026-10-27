import type { GameSnapshot } from '@shared/play/protocol';
import { fn } from 'storybook/test';

import { alliancesSnapshot, faction, VIEWER } from '../../alliances.stories.fixture';
import { panelMeta, tableOf } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { AlliancesPanel } from './AlliancesPanel';
import type { AlliancesPanelProps } from './AlliancesPanel';
import { allianceRows } from './useAlliancesPanel';

/** The panel's props as the table hands them for this snapshot, seen from the viewer's seat, with spied actions. */
export function alliancesProps(snapshot: GameSnapshot = alliancesSnapshot()): AlliancesPanelProps {
  return { rows: allianceRows(tableOf(snapshot, VIEWER)), disabled: false, onAction: fn() };
}

/** The viewer allied with seat 4, so the viewer's own row offers to break it. */
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
