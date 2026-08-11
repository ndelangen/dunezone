import type { ReactNode } from 'react';

import styles from './PageLayout.module.css';

export interface PageLayoutProps {
  /** Content rendered inside the hero. Omit only for intentionally compact pages. */
  header?: ReactNode;
  /** Reduce the hero height for content-heavy detail pages. */
  headerSize?: 'default' | 'compact';
  /**
   * A `Toolbar`, rendered before the main content. It is a surface and brings its own pane, so this
   * slot adds nothing around it — anything passed here needs a pane of its own.
   */
  toolbar?: ReactNode;
  children: ReactNode;
}

/** Route-owned page composition with typed header, toolbar, and content slots. */
export function PageLayout({ header, headerSize = 'default', toolbar, children }: PageLayoutProps) {
  return (
    <div
      className={styles.layout}
      data-page-layout-compact={header == null ? 'true' : undefined}
      data-page-layout-header-size={header == null ? undefined : headerSize}
    >
      {header != null && <div className={styles.headerContent}>{header}</div>}
      <main className={styles.content}>
        {toolbar}
        {children}
      </main>
    </div>
  );
}
