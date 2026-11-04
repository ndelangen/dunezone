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

/* A Lasgun card deleted from the table, which the game still keeps, so its entry offers to restore it (#2132). */
export const DELETION_ENTRY: LogEntry = {
  sequence: 7,
  class: 'deletion',
  text: 'Ridwan deleted Lasgun card from the game.',
  context: 'Turn 2, Battle',
  at: 1100,
  restore: '42',
};

/* The same deletion once someone restored it: the entry no longer offers it, and the restore has its own entry. */
export const RESTORED_ENTRIES: LogEntry[] = [
  {
    sequence: 8,
    class: 'restore',
    text: 'Central restored Treachery card to the table, face down.',
    context: 'Turn 2, Battle',
    at: 1200,
  },
  { ...DELETION_ENTRY, restore: undefined },
];

export const logPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.gameLog),
  component: LogPanel,
  args: {
    tab: 'game',
    page: logPage(GAME_LOG),
    onEarlier: fn(),
    onLatest: fn(),
    onRestore: fn(),
  } satisfies LogPanelProps,
};
