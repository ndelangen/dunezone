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

/** A wide column beside a narrow one, responsive by container query. */
function AsymmetricSplitLayoutBase({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
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
      <div className={styles.layout}>
        <div>{wide}</div>
        <div>{narrow}</div>
      </div>
    </div>
  );
}

type AsymmetricSplitLayoutComponent = ((
  props: PropsWithChildren<{ className?: string }>
) => ReactNode) & {
  Wide: typeof Wide;
  Narrow: typeof Narrow;
};

export const AsymmetricSplitLayout = Object.assign(AsymmetricSplitLayoutBase, {
  Wide,
  Narrow,
}) as AsymmetricSplitLayoutComponent;
