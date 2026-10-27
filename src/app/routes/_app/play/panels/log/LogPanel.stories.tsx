import preview from '@sb/preview';

import { AUDIT_LOG, GAME_LOG } from '../../game.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { BUG_REPORT_ENTRY, logPage, logPanelMeta } from './LogPanel.stories.fixture';

/*
 * The Game log and Audit windows on their own: one tab of the table's public log, newest first,
 * each entry tagged with its kind and the phase it happened in.
 */
const meta = preview.meta({ ...logPanelMeta, title: 'Play/Panels/Log' });

/** The game log at the prediction step, a bug report on top with its issue, and older entries a click away. */
export const GameLog = meta.story({
  args: { page: logPage([BUG_REPORT_ENTRY, ...GAME_LOG], { more: true }) },
});

/** The audit log: seats taken and left, and a removal vote. */
export const Audit = meta.story({
  args: { tab: 'audit', page: logPage(AUDIT_LOG) },
  parameters: { panelWindow: PANEL_WINDOWS.audit },
});

/** A new table has written nothing yet. */
export const Empty = meta.story({ args: { page: logPage([]) } });
