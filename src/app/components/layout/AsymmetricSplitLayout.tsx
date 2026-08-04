import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './AsymmetricSplitLayout.module.css';

export function AsymmetricSplitLayout({
  className,
  wide,
  narrow,
}: {
  className?: string;
  wide: ReactNode;
  narrow: ReactNode;
}) {
  return (
    <div className={clsx(styles.root, className)}>
      <div>{wide}</div>
      <div>{narrow}</div>
    </div>
  );
}
