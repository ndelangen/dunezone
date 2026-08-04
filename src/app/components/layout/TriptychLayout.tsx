import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './TriptychLayout.module.css';

export function TriptychLayout({
  left,
  center,
  centerClassName,
  right,
}: {
  left: ReactNode;
  center: ReactNode;
  centerClassName?: string;
  right: ReactNode;
}) {
  return (
    <div className={styles.root}>
      <div className={styles.left}>{left}</div>
      <div className={styles.center}>
        <div className={clsx(styles.centerFill, centerClassName)}>{center}</div>
      </div>
      <div className={styles.right}>{right}</div>
    </div>
  );
}
