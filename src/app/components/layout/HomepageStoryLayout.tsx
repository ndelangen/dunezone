import type { ReactNode } from 'react';

import styles from './HomepageStoryLayout.module.css';

export function HomepageStoryLayout({
  play,
  preview,
  create,
}: {
  play: ReactNode;
  preview: ReactNode;
  create: ReactNode;
}) {
  return (
    <section className={styles.root}>
      <div className={styles.play}>{play}</div>
      <div className={styles.preview}>{preview}</div>
      <div className={styles.create}>{create}</div>
    </section>
  );
}
