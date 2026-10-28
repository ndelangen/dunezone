import type { ReactNode } from 'react';

import { FigureCaptionLayout } from '../layout/FigureCaptionLayout';
import { Card } from '../surface/Card';
import styles from './CardGrid.module.css';

interface GridCard {
  key: string;
  title: string;
  /** The one status or control beside the title. */
  badge?: ReactNode;
  /** The card's picture, with its caption beneath it or, on a wide card, beside it. */
  figure: ReactNode;
  caption: ReactNode;
}

export interface CardGridProps {
  /** Names the list for assistive tech, since a grid of cards has no heading of its own. */
  'aria-label': string;
  /** The cards, in reading order. */
  items: readonly GridCard[];
}

/**
 * A list of titled cards, each a figure over its caption, in a grid that asks its own width: one column, two from 30rem, three from 62rem.
 *
 * Callers own what each card says and shows;
 * this component owns that they are a list, the cards' shape, and how many sit in a row.
 */
export function CardGrid({ 'aria-label': ariaLabel, items }: CardGridProps) {
  return (
    <div className={styles.room}>
      <ul className={styles.grid} aria-label={ariaLabel}>
        {items.map((item) => (
          /* Each card stretches to its cell, so the cards in a row share their height. */
          <li key={item.key} className={styles.cell}>
            <Card title={item.title} action={item.badge} padding="md">
              <FigureCaptionLayout>
                <FigureCaptionLayout.Figure>{item.figure}</FigureCaptionLayout.Figure>
                <FigureCaptionLayout.Caption>{item.caption}</FigureCaptionLayout.Caption>
              </FigureCaptionLayout>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
