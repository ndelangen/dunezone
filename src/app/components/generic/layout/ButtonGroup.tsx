import type { ReactNode } from 'react';

import styles from './ButtonGroup.module.css';

export interface ButtonGroupProps {
  children: ReactNode;
}

/**
 * Horizontal row of buttons or actions. Use wherever a set of related buttons needs to be displayed
 * inline, instead of creating ad-hoc flex containers or borrowing layout from other components.
 */
export function ButtonGroup({ children }: ButtonGroupProps) {
  return <div className={styles.root}>{children}</div>;
}
