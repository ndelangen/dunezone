import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

import styles from './ChipList.module.css';

interface Chip {
  key: string;
  /** A small round picture of the thing, hidden from assistive tech: the label names it. */
  figure: ReactNode;
  label: string;
}

export interface ChipListProps {
  /** The things, in reading order. */
  items: readonly Chip[];
}

/**
 * A wrapping row of small pictures, each with its name beside it: a set of factions at a glance.
 *
 * Callers own the things and their pictures;
 * this component owns the row, how it wraps, and the pictures' size.
 */
export function ChipList({ items }: ChipListProps) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.key} className={styles.chip}>
          <span className={styles.figure} aria-hidden>
            {item.figure}
          </span>
          <Text size="sm">{item.label}</Text>
        </li>
      ))}
    </ul>
  );
}
