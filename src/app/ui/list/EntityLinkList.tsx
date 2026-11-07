import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';

import styles from './EntityLinkList.module.css';

export interface EntityLinkListProps {
  /** One entity link (`AssetLink`, `RulesetLink`, `GroupLink` and the like) per entity, usually mapped from a collection. */
  children: ReactNode;
}

/**
 * Entities named as links, one per row.
 *
 * Callers own the collection, the link for each entity, and what to say when there is none (an `EmptyNote`).
 * This owns that they are a real list, so a screen reader announces how many there are, and the one rhythm between rows that every card listing rulesets, groups or containers shares.
 */
export function EntityLinkList({ children }: EntityLinkListProps) {
  return (
    <ul className={styles.list}>
      {Children.map(children, (child) => (isValidElement(child) ? <li className={styles.item}>{child}</li> : null))}
    </ul>
  );
}
