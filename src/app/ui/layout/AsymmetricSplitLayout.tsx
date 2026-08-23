import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './AsymmetricSplitLayout.module.css';

function Wide(_: PropsWithChildren): null {
  return null;
}

function Narrow(_: PropsWithChildren): null {
  return null;
}

type AsymmetricSplitLayoutProps = PropsWithChildren<{
  className?: string;
  /** `slim` narrows the second column to a fixed-ish band, for pages whose matter is the wide column. */
  rail?: 'reading' | 'slim';
}>;

/**
 * A wide column beside a narrow one, responsive by container query.
 * `rail="slim"` narrows the second column to a fixed-ish band, for pages whose matter is the wide column and whose rail only carries a preview and a few cards (Norbert, 2026-08-22).
 */
function AsymmetricSplitLayoutBase({ className, rail = 'reading', children }: AsymmetricSplitLayoutProps) {
  let wide: ReactNode = null;
  let narrow: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (child.type === Wide) {
      wide = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Narrow) {
      narrow = (child.props as PropsWithChildren).children;
    }
  });

  return (
    <div className={clsx(styles.root, className)}>
      <div className={clsx(styles.layout, rail === 'slim' && styles.slim)}>
        <div>{wide}</div>
        <div>{narrow}</div>
      </div>
    </div>
  );
}

type AsymmetricSplitLayoutComponent = ((props: AsymmetricSplitLayoutProps) => ReactNode) & {
  Wide: typeof Wide;
  Narrow: typeof Narrow;
};

export const AsymmetricSplitLayout = Object.assign(AsymmetricSplitLayoutBase, {
  Wide,
  Narrow,
}) as AsymmetricSplitLayoutComponent;
