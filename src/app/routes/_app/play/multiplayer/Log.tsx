import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import type { LogClass, LogTab } from '@shared/play/log';
import { Section } from '@ui/block/Section';
import { useEffect, useSyncExternalStore } from 'react';

import styles from './Log.module.css';
import type { TableProjection, TableSession } from './TableSession';

/* The accepted classification palette: each class wears its own colour, the badge is the only mark a row carries. */
const CLASSIFICATIONS = {
  phase: { label: 'Phase', color: 'cyan' },
  spice: { label: 'Spice', color: 'orange' },
  battle: { label: 'Battle', color: 'red' },
  prediction: { label: 'Prediction', color: 'grape' },
  seat: { label: 'Seat', color: 'blue' },
  vote: { label: 'Vote', color: 'green' },
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
  useEffect(() => {
    client.readLogHistory(tab);
  }, [client, tab, table.liveRevision]);
  return (
    <Section helpOnly title={TITLES[tab]}>
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
                <Badge variant="light" color={CLASSIFICATIONS[entry.class].color} size="sm" tt="none">
                  {CLASSIFICATIONS[entry.class].label}
                </Badge>
                <div>
                  <Text size="sm">{entry.text}</Text>
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
