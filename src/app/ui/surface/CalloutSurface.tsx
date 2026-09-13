import type { ReactNode } from 'react';

import styles from './CalloutSurface.module.css';
import { PaintedSurfaceBoundary } from './Surface';

/**
 * Prototype candidate for #1148.
 * Callers own the content and target geometry;
 * this Surface owns a capsule, attached action tab and broad pointer without an outline.
 * The inherited --callout-tail-* properties describe the pointer in pixels relative to the capsule.
 */
export function CalloutSurface({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <PaintedSurfaceBoundary>
      <div className={styles.root}>
        <div className={styles.capsule}>{children}</div>
        <div className={styles.actions}>{actions}</div>
      </div>
    </PaintedSurfaceBoundary>
  );
}
