import type { ReactNode } from 'react';

import styles from './AtlasLayout.module.css';

export function AtlasLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.root}>
      <div className={styles.sidebar}>{sidebar}</div>
      <div>{children}</div>
    </div>
  );
}
