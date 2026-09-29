import { Popover, Stack, Text, VisuallyHidden } from '@mantine/core';
import clsx from 'clsx';
import { Info } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import type { StatusMarkProps } from '../content/StatusMark';
import { IconAction } from './IconAction';
import styles from './StatusInfo.module.css';

/** One status the page states, as a glyph, a tone and its words. */
export type StatusInfoItem = Pick<StatusMarkProps, 'tone' | 'icon' | 'label'>;

export interface StatusInfoProps {
  /** What the list is about, as a noun phrase: "Faction status". The action's name and the list's heading. */
  label: string;
  /** Every status, most pressing first. Empty entries are skipped, and with none left nothing renders. */
  statuses: readonly (StatusInfoItem | null | undefined | false)[];
}

/* A list is the only place several statuses are read at once, so each keeps its tone here, where the page's colours hold. */
function StatusRow({ tone = 'neutral', icon, label }: StatusInfoItem): ReactNode {
  return (
    <li className={styles.row}>
      <span aria-hidden className={clsx(styles.glyph, styles[tone])}>
        {icon}
      </span>
      <Text size="sm" inherit>
        {label}
      </Text>
    </li>
  );
}

/**
 * The page's statuses behind one info action, so the toolbar holds actions only and the facts are one press away (Norbert, 2026-09-29).
 *
 * Callers own the statuses and their words.
 * This owns where they are read: a list that opens under the action, with each status's glyph in its tone.
 * The words are also the action's description, so a reader who never opens the list still hears them.
 * It stands first on the right edge of a toolbar, as `Toolbar.Cluster kind="about"`, and never folds away.
 */
export function StatusInfo({ label, statuses }: StatusInfoProps) {
  const [opened, setOpened] = useState(false);
  const descriptionId = useId();
  const listed = statuses.filter((status): status is StatusInfoItem => Boolean(status));
  if (listed.length === 0) {
    return null;
  }
  return (
    <>
      <VisuallyHidden id={descriptionId}>{listed.map((status) => status.label).join(' ')}</VisuallyHidden>
      <Popover opened={opened} onChange={setOpened} position="bottom-end" shadow="md" width={320} withArrow>
        <Popover.Target>
          <IconAction
            label={label}
            emphasis="standard"
            intent="neutral"
            size="lg"
            aria-describedby={descriptionId}
            onClick={() => setOpened((current) => !current)}
            icon={<Info size={17} aria-hidden />}
          />
        </Popover.Target>
        <Popover.Dropdown aria-label={label}>
          <Stack gap="xs">
            <Text size="sm" fw={700}>
              {label}
            </Text>
            <ul className={styles.list}>
              {listed.map((status) => (
                <StatusRow key={status.label} {...status} />
              ))}
            </ul>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </>
  );
}
