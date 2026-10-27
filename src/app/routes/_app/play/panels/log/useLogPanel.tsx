import type { LogTab } from '@shared/play/log';
import { useEffect, useSyncExternalStore } from 'react';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { LogPanel } from './LogPanel';
import type { LogPanelProps } from './LogPanel';

type Props = Readonly<{ client: TableSession; table: TableProjection; tab: LogTab }>;

/* The newest page is read from before every entry there could be. */
const NEWEST = Number.MAX_SAFE_INTEGER;

/** A log tab's page from the table session, read again as the table changes, and the reads for the older and newest pages. */
function useLogPanel({ client, table, tab }: Props): LogPanelProps {
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const page = view.logHistory[tab];
  /* No update says whether the log grew, so a changed table reads the page again; a burst of changes reads it once more at its end. */
  useEffect(() => client.refreshLogHistory(tab), [client, tab, table.liveRevision, table.reconnecting]);
  return {
    tab,
    page: page ? { entries: page.entries, more: page.more, latest: page.before === NEWEST } : null,
    onEarlier: () => {
      const last = page?.entries.at(-1);
      if (last) {
        client.readLogHistory(tab, last.sequence);
      }
    },
    onLatest: () => client.readLogHistory(tab, NEWEST),
  };
}

/** A log window's content at a live table. */
export function ConnectedLogPanel(props: Props) {
  return <LogPanel {...useLogPanel(props)} />;
}
