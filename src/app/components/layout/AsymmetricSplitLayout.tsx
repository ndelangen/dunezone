import type { ReactNode } from 'react';

import styles from './AsymmetricSplitLayout.module.css';

export function AsymmetricSplitLayout({ wide, narrow }: { wide: ReactNode; narrow: ReactNode }) {
  return (
    <div className={styles.root}>
      <div>{wide}</div>
      <div>{narrow}</div>
    </div>
  );
}
