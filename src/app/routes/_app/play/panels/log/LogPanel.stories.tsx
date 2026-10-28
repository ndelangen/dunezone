import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { AUDIT_LOG, GAME_LOG } from '../../game.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { BUG_REPORT_ENTRY, logPage, logPanelMeta } from './LogPanel.stories.fixture';

/*
 * The Game log and Audit windows on their own: one tab of the table's public log, newest first,
 * each entry tagged with its kind and the phase it happened in.
 */
const meta = preview.meta({ ...logPanelMeta, title: 'Play/Panels/Log' });

/** The game log at the prediction step, newest first, each entry with its kind and when it happened. */
export const GameLog = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'SpiceRidwan collected 3 spice from the table into the Fremen spice reserve.Setup, Prediction',
      'SpiceCentral withdrew 4 spice from the House Atreides spice reserve to the table.Setup, Prediction',
      'PredictionBene Gesserit revealed its prediction: House Atreides, turn 6.Setup, Prediction',
      'PredictionBene Gesserit locked its prediction.Setup, Prediction',
    ]);
    await expect(canvas.queryByRole('button', { name: 'Earlier entries' })).toBeNull();
  },
});

/** An older page of a longer log: it reads further back or returns to the newest. */
export const OlderPage = meta.story({ args: { page: logPage(GAME_LOG, { more: true, latest: false }) } });

/** A bug report filed from the table, linked to its issue. */
export const BugReport = meta.story({
  args: { page: logPage([BUG_REPORT_ENTRY]) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Open GitHub issue' })).toHaveAttribute(
      'href',
      BUG_REPORT_ENTRY.issueUrl
    );
  },
});

/** The audit log: seats taken and left, and a removal vote. */
export const Audit = meta.story({
  args: { tab: 'audit', page: logPage(AUDIT_LOG) },
  parameters: { panelWindow: PANEL_WINDOWS.audit },
});

/** A new table has written nothing yet. */
export const Empty = meta.story({ args: { page: logPage([]) } });

/** Before the first page arrives. */
export const Loading = meta.story({ args: { page: null } });
