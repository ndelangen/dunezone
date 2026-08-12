import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './AtlasLayout.module.css';

export function AtlasLayout({
  className,
  sidebar,
  sidebarClassName,
  children,
}: {
  className?: string;
  sidebar: ReactNode;
  sidebarClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={clsx(styles.root, className)}>
      <div className={styles.layout}>
        <div className={clsx(styles.sidebar, sidebarClassName)}>{sidebar}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}
