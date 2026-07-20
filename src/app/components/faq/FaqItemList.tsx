import { Paper, Stack, Table } from '@mantine/core';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './FaqItemList.module.css';

export type FaqItemListProps = {
  className?: string;
  children: ReactNode;
};

/**
 * FAQ thread list shell. Parent owns empty state and row content.
 */
export function FaqItemList({ className, children }: FaqItemListProps) {
  return (
    <Paper withBorder radius="md" className={styles.surface}>
      <Table
        withRowBorders
        highlightOnHover
        horizontalSpacing="md"
        verticalSpacing="md"
        className={clsx(styles.list, className)}
      >
        <Table.Tbody>{children}</Table.Tbody>
      </Table>
    </Paper>
  );
}

export type FaqItemListRowProps = {
  children: ReactNode;
  metadata?: ReactNode;
  onActivate?: () => void;
  ariaLabel?: string;
};

/**
 * Single FAQ entry rendered as a lightly divided table row.
 */
export function FaqItemListRow({ children, metadata, onActivate, ariaLabel }: FaqItemListRowProps) {
  const isInteractiveTarget = (target: EventTarget) =>
    target instanceof Element &&
    target.closest('a, button, input, select, textarea, [role="button"]') != null;

  return (
    <Table.Tr
      className={onActivate ? styles.interactiveRow : undefined}
      role={onActivate ? 'link' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={onActivate ? ariaLabel : undefined}
      onClick={(event) => {
        if (!onActivate || isInteractiveTarget(event.target)) return;
        onActivate();
      }}
      onKeyDown={(event) => {
        if (!onActivate || event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onActivate();
      }}
    >
      <Table.Td className={styles.rowCell}>
        <Stack gap="sm" className={styles.itemContent}>
          {children}
          {metadata ? <div className={styles.metadataRow}>{metadata}</div> : null}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}
