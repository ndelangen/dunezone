import type { ReactNode } from 'react';

import { HeadingSlot } from '../content/headingSlot';
import styles from './Card.module.css';
import { Surface } from './Surface';

export interface CardProps {
  /**
   * Required. A Card without a heading is a `Surface` — the heading is the whole reason this
   * component exists, not an embellishment on it. Usually a `Section`.
   */
  header: ReactNode;
  children: ReactNode;
}

/**
 * A titled region of a page.
 *
 * Callers own the title and the body. This component owns the relationship between them: the
 * gutter, the gap that separates heading from content, and clipping to the rounded corner.
 *
 * The pane it sits on is `Surface`, and that division is deliberate — `Surface` answers "content
 * needs a plane", `Card` answers "this region needs a name". When the header was optional the two
 * answered the same question and picking between them was a coin toss.
 *
 * For a named region whose content brings panes of its own — a list of cards, a grid of spotlights
 * — use `Region` instead. Putting those in a card would nest surfaces.
 */
export function Card({ header, children }: CardProps) {
  return (
    <Surface padding="lg" className={styles.card}>
      <div className={styles.header}>
        <HeadingSlot>{header}</HeadingSlot>
      </div>
      <div className={styles.body}>{children}</div>
    </Surface>
  );
}
