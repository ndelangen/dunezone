import { Badge, Text } from '@mantine/core';
import type { ReactNode } from 'react';

import styles from './ChipList.module.css';

interface Chip {
  key: string;
  /**
   * A small round picture of the thing, hidden from assistive tech: the label names it.
   * Leave it out for a word that has no picture, and the word is drawn as a tag.
   */
  figure?: ReactNode;
  label: string;
}

export interface ChipListProps {
  /** The things, in reading order. */
  items: readonly Chip[];
}

/**
 * A wrapping row of small things by name: a set of factions at a glance, each with its picture, or a set of words as tags.
 *
 * Callers own the things and their pictures;
 * this component owns the row, how it wraps, the pictures' size, and the one look a word tag has, so the glossary's avoided words and a question's topics are drawn alike.
 */
export function ChipList({ items }: ChipListProps) {
  const words = items.every((item) => item.figure === undefined);
  return (
    <ul className={words ? `${styles.list} ${styles.words}` : styles.list}>
      {items.map((item) =>
        item.figure === undefined ? (
          <li key={item.key}>
            <Badge variant="outline" color="gray" size="sm" tt="none">
              {item.label}
            </Badge>
          </li>
        ) : (
          <li key={item.key} className={styles.chip}>
            <span className={styles.figure} aria-hidden>
              {item.figure}
            </span>
            <Text size="sm">{item.label}</Text>
          </li>
        )
      )}
    </ul>
  );
}
