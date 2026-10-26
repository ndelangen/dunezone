import { Anchor, Badge, Button, Group, Stack, Text } from '@mantine/core';
import type { LogClass, LogTab } from '@shared/play/log';
import { Section } from '@ui/block/Section';
import { useEffect, useSyncExternalStore } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import styles from './Log.module.css';

/* Event labels identify the class; their colours reuse the app's semantic families. */
const CLASSIFICATIONS = {
  phase: { label: 'Phase', color: 'blue' },
  spice: { label: 'Spice', color: 'yellow' },
  battle: { label: 'Battle', color: 'red' },
  prediction: { label: 'Prediction', color: 'violet' },
  alliance: { label: 'Alliance', color: 'confirm' },
  deletion: { label: 'Deleted', color: 'gray' },
  seat: { label: 'Seat', color: 'blue' },
  vote: { label: 'Vote', color: 'confirm' },
  'bug-report': { label: 'Bug report', color: 'caution' },
} as const satisfies Record<LogClass, { label: string; color: string }>;

const TITLES = { game: 'Game log', audit: 'Audit log' } as const satisfies Record<LogTab, string>;

/**
 * One tab of the retained public log, newest first, with the older pages a click away.
 * The page stays where the reader left it while the table keeps changing;
 * the newest page is one control away.
 */
export function LogEntries({
  client,
  table,
  tab,
}: Readonly<{ client: TableSession; table: TableProjection; tab: LogTab }>) {
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const page = view.logHistory[tab];
  /* No update says whether the log grew, so a changed table reads the page again; a burst of changes reads it once more at its end. */
  useEffect(() => client.refreshLogHistory(tab), [client, tab, table.liveRevision, table.reconnecting]);
  return (
    <Section hiddenHeading title={TITLES[tab]}>
      <Stack gap="md">
        {!page ? (
          <Text size="sm">Loading the log...</Text>
        ) : page.entries.length === 0 ? (
          <Text size="sm" c="dimmed">
            No entries yet.
          </Text>
        ) : (
          <ol className={styles.list}>
            {page.entries.map((entry) => (
              <li key={entry.sequence} className={styles.entry}>
                <Badge variant="light" color={CLASSIFICATIONS[entry.event ?? entry.class].color} size="sm" tt="none">
                  {CLASSIFICATIONS[entry.event ?? entry.class].label}
                </Badge>
                <div>
                  <Text size="sm">{entry.text}</Text>
                  {entry.issueUrl && (
                    <Anchor size="sm" href={entry.issueUrl} target="_blank" rel="noopener noreferrer">
                      Open GitHub issue
                    </Anchor>
                  )}
                  {entry.context && (
                    <Text size="xs" c="dimmed">
                      {entry.context}
                    </Text>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {page && (page.more || page.before !== Number.MAX_SAFE_INTEGER) && (
          <Group>
            {page.more && (
              <Button variant="default" onClick={() => client.readLogHistory(tab, page.entries.at(-1)!.sequence)}>
                Earlier entries
              </Button>
            )}
            {page.before !== Number.MAX_SAFE_INTEGER && (
              <Button variant="default" onClick={() => client.readLogHistory(tab, Number.MAX_SAFE_INTEGER)}>
                Latest entries
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </Section>
  );
}
