import type { ReactNode } from 'react';

import styles from './AtlasLayout.module.css';

export function AtlasLayout({ index, children }: { index: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.root}>
      <aside className={styles.index}>{index}</aside>
      <div>{children}</div>
    </section>
  );
}
