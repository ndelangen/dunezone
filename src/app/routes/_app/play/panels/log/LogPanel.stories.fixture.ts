import type { LogEntry } from '@shared/play/log';
import { fn } from 'storybook/test';

import { GAME_LOG } from '../../game.stories.fixture';
import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { LogPanel } from './LogPanel';
import type { LogPanelProps } from './LogPanel';

/** A page of the log as the table answers a read: the newest page, with nothing older, unless the story says otherwise. */
export function logPage(entries: readonly LogEntry[], { more = false, latest = true } = {}) {
  return { entries, more, latest };
}

/* A bug report filed from the table, as the game log records it with its issue. */
export const BUG_REPORT_ENTRY: LogEntry = {
  sequence: 6,
  class: 'phase',
  event: 'bug-report',
  text: 'A full game state export was published.',
  context: 'Turn 1, Storm',
  at: 1000,
  issueUrl: 'https://github.com/ndelangen/dunezone/issues/1',
};

/* A battle resolved with the spice each side spent, and a later one cancelled before its reveal, as the game log records them. */
export const BATTLE_SPICE_ENTRIES: LogEntry[] = [
  {
    sequence: 8,
    class: 'battle',
    text: 'The battle between Fremen and House Harkonnen was cancelled before the reveal; any spice in its plans went back to the spice reserves.',
    context: 'Turn 2, Battle',
    at: 1200,
  },
  {
    sequence: 7,
    class: 'battle',
    text: 'House Atreides defeated House Harkonnen. Spice spent from the reserves: House Atreides 9, House Harkonnen 2.',
    context: 'Turn 2, Battle',
    at: 1100,
  },
];

export const logPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.gameLog),
  component: LogPanel,
  args: { tab: 'game', page: logPage(GAME_LOG), onEarlier: fn(), onLatest: fn() } satisfies LogPanelProps,
};
