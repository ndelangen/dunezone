import { Text, VisuallyHidden } from '@mantine/core';
import type { ReactNode } from 'react';

import styles from './TallyList.module.css';

interface Tally {
  key: string;
  /** A small picture of the thing, hidden from assistive tech: the title names it. */
  figure: ReactNode;
  /** A card stands narrower than a token, so it reads at the same height beside it. */
  figureShape?: 'token' | 'card';
  title: string;
  detail?: string;
  /** The count as printed, such as `40` or `40+`. */
  count: string;
  /** The count in words, such as `40 cards`. */
  countLabel: string;
}

export interface TallyListProps {
  /** The things, in reading order. */
  items: readonly Tally[];
}

/**
 * A ruled list of things with how many there are of each: a picture, a title over its detail, and the count large at the end, ruled off with dashed lines.
 *
 * Callers own the things and their words;
 * this component owns the row, the rules and the count's type.
 */
export function TallyList({ items }: TallyListProps) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.key} className={styles.row}>
          <span className={styles.figure} data-shape={item.figureShape ?? 'token'} aria-hidden>
            {item.figure}
          </span>
          <span className={styles.what}>
            <Text fw={700} size="sm">
              {item.title}
            </Text>
            {item.detail ? (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {item.detail}
              </Text>
            ) : null}
          </span>
          {/* A plain span's label is not read, so the count in words is hidden text and the printed figure is hidden from assistive tech. */}
          <span className={styles.count}>
            <span aria-hidden>{item.count}</span>
            <VisuallyHidden>{item.countLabel}</VisuallyHidden>
          </span>
        </li>
      ))}
    </ul>
  );
}
