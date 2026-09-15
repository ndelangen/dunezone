import { useElementSize } from '@mantine/hooks';
import type { ReactNode } from 'react';

import styles from './CalloutSurface.module.css';
import { PaintedSurfaceBoundary } from './Surface';

/** Callers supply content and actions; this pane owns the capsule and attached lower tab. */
export function CalloutSurface({
  children,
  actions,
  pointer,
}: {
  children: ReactNode;
  actions: ReactNode;
  pointer?: [number, number];
}) {
  const { ref, height } = useElementSize();
  const tip = pointer ?? [0, height / 2 + 26];
  const edge = tip[1] < 0 ? -height / 2 : height / 2;
  return (
    <PaintedSurfaceBoundary>
      <div className={styles.root} ref={ref}>
        <svg className={styles.pointer} width="1" height="1" aria-hidden="true">
          <polygon points={`${-16},${edge} 16,${edge} ${tip[0]},${tip[1]}`} />
        </svg>
        <div className={styles.content}>{children}</div>
        <div className={styles.actions}>{actions}</div>
      </div>
    </PaintedSurfaceBoundary>
  );
}
