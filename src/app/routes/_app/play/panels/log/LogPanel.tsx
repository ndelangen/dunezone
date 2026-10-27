import { Anchor, Badge, Button, Group, Stack, Text } from '@mantine/core';
import type { LogClass, LogEntry, LogTab } from '@shared/play/log';
import { Section } from '@ui/block/Section';

import styles from './LogPanel.module.css';

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
  'bug-report': { label: 'Bug report', color: 'orange' },
} as const satisfies Record<LogClass, { label: string; color: string }>;

const TITLES = { game: 'Game log', audit: 'Audit log' } as const satisfies Record<LogTab, string>;

/** One page of a log tab: its entries newest first, whether older ones follow, and whether it is the newest page. */
type LogPanelPage = Readonly<{ entries: readonly LogEntry[]; more: boolean; latest: boolean }>;

export type LogPanelProps = Readonly<{
  tab: LogTab;
  /** The page on show, or null while the first one loads. */
  page: LogPanelPage | null;
  onEarlier: () => void;
  onLatest: () => void;
}>;

/**
 * One tab of the retained public log, newest first, with the older pages a click away.
 * The page stays where the reader left it while the table keeps changing;
 * the newest page is one control away.
 */
export function LogPanel({ tab, page, onEarlier, onLatest }: LogPanelProps) {
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
        {page && (page.more || !page.latest) && (
          <Group>
            {page.more && (
              <Button variant="default" onClick={onEarlier}>
                Earlier entries
              </Button>
            )}
            {!page.latest && (
              <Button variant="default" onClick={onLatest}>
                Latest entries
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </Section>
  );
}
