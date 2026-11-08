import type { ReactNode } from 'react';

import styles from './RankedList.module.css';

interface RankedItem {
  key: string;
  /** The place in the ranking. Equal places repeat, so a tie reads as a tie. */
  rank: number;
  /** Who or what holds the place, usually a link to it. */
  subject: ReactNode;
  /** A line under the subject, such as a few member faces. */
  detail?: ReactNode;
  /** What the place was earned with, at the row's end. */
  score: ReactNode;
}

export interface RankedListProps {
  /** The places, best first. */
  items: readonly RankedItem[];
  /** Names the list for assistive tech, such as `Faction designers ranking`. */
  label: string;
}

/**
 * A ranking: each row its place, who holds it, and what earned it, best first.
 *
 * Callers own the order, the places and the words;
 * this component owns the row, the place's figure, and the emphasis on the top three.
 */
export function RankedList({ items, label }: RankedListProps) {
  return (
    <ol className={styles.list} aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className={styles.row}>
          <span className={styles.rank} data-podium={item.rank <= 3 ? item.rank : undefined}>
            {item.rank}
          </span>
          <span className={styles.subject}>
            {item.subject}
            {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
          </span>
          <span className={styles.score}>{item.score}</span>
        </li>
      ))}
    </ol>
  );
}
