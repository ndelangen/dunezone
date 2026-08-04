import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './TriptychLayout.module.css';

export function TriptychLayout({
  className,
  left,
  center,
  centerClassName,
  right,
}: {
  className?: string;
  left: ReactNode;
  center: ReactNode;
  centerClassName?: string;
  right: ReactNode;
}) {
  return (
    <div className={clsx(styles.root, className)}>
      <div>{left}</div>
      <div className={styles.center}>
        <div className={clsx(styles.centerFill, centerClassName)}>{center}</div>
      </div>
      <div>{right}</div>
    </div>
  );
}
