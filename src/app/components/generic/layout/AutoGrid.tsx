import clsx from 'clsx';
import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from 'react';

import styles from './AutoGrid.module.css';

const gapClass = {
  3: styles.gap3,
  4: styles.gap4,
  5: styles.gap5,
  6: styles.gap6,
} as const;

export type AutoGridGap = keyof typeof gapClass;

type AutoGridStyle = CSSProperties & { '--auto-grid-min'?: string };

export type AutoGridProps<T extends ElementType = 'div'> = {
  as?: T;
  /** Passed to `minmax(..., 1fr)`; default `180px`. */
  minColumnWidth?: string;
  gap?: AutoGridGap;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className' | 'style'>;

/** Responsive auto-fill grid: columns grow from a minimum track width with consistent gap tokens. */
export function AutoGrid<T extends ElementType = 'div'>({
  as,
  minColumnWidth = '180px',
  gap = 4,
  className,
  children,
  style,
  ...rest
}: AutoGridProps<T>) {
  const Component = (as ?? 'div') as ElementType;
  const gridStyle: AutoGridStyle = {
    '--auto-grid-min': minColumnWidth,
    ...style,
  };

  return (
    <Component className={clsx(styles.root, gapClass[gap], className)} style={gridStyle} {...rest}>
      {children}
    </Component>
  );
}
