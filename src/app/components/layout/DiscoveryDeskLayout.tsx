import type { ReactNode } from 'react';

import styles from './DiscoveryDeskLayout.module.css';

export function DiscoveryDeskLayout({
  catalogue,
  future,
}: {
  catalogue: ReactNode;
  future: ReactNode;
}) {
  return (
    <section className={styles.root}>
      <div>{catalogue}</div>
      <div>{future}</div>
    </section>
  );
}
