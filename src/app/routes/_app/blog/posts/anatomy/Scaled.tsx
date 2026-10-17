import { CanvasScale } from '@ui/layout/CanvasScale';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

import styles from './Scaled.module.css';

/**
 * A renderer drawn at its native canvas size and scaled to the surrounding `--output-height` times `scale`.
 * The scales keep the assets roughly in the sizes they have on the table, relative to each other.
 */
export function Scaled({
  size,
  scale = 1,
  round = false,
  children,
}: {
  size: { width: number; height: number };
  scale?: number;
  round?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(styles.scaled, round && styles.round)}
      style={{ '--art-aspect': size.width / size.height, '--art-scale': scale } as CSSProperties}
    >
      <CanvasScale canvasWidth={size.width} canvasHeight={size.height}>
        {children}
      </CanvasScale>
    </span>
  );
}

/** The sheet's own preview frame, filling its scaled canvas. */
export function SheetFrame({ children }: { children: ReactNode }) {
  return <span className={styles.sheet}>{children}</span>;
}
