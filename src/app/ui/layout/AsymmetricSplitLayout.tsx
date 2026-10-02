import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './AsymmetricSplitLayout.module.css';
import { warnDroppedChild } from './warnDroppedChild';

const ASYMMETRICSPLIT_SLOTS = ['AsymmetricSplitLayout.Wide', 'AsymmetricSplitLayout.Narrow'] as const;

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
  /** Which side the narrow column takes once the columns split. `start` puts it before the wide one. */
  narrowSide?: 'end' | 'start';
  /** Which column comes first in reading order, and so on top once they stack. `narrow` leads with it, for a picture that introduces the text beside it. */
  stackFirst?: 'wide' | 'narrow';
  /**
   * What happens to the columns in a narrow container. `stack` puts them in one reading column below 61.25rem.
   * `hide` keeps them side by side down to the phone step and then drops the narrow column, for a picture that only decorates the text beside it (Norbert, 2026-10-02).
   */
  narrowFallback?: 'stack' | 'hide';
}>;

/**
 * A wide column beside a narrow one, responsive by container query.
 * `rail="slim"` narrows the second column to a fixed-ish band, for pages whose matter is the wide column and whose rail only carries a preview and a few cards (Norbert, 2026-08-22).
 */
function AsymmetricSplitLayoutBase({
  className,
  rail = 'reading',
  narrowSide = 'end',
  stackFirst = 'wide',
  narrowFallback = 'stack',
  children,
}: AsymmetricSplitLayoutProps) {
  let wide: ReactNode = null;
  let narrow: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      warnDroppedChild('AsymmetricSplitLayout', ASYMMETRICSPLIT_SLOTS, child);
      return;
    }
    if (child.type === Wide) {
      wide = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Narrow) {
      narrow = (child.props as PropsWithChildren).children;
      return;
    }
    warnDroppedChild('AsymmetricSplitLayout', ASYMMETRICSPLIT_SLOTS, child);
  });

  return (
    <div className={clsx(styles.root, className)}>
      <div
        className={clsx(styles.layout, rail === 'slim' && styles.slim)}
        data-narrow-side={narrowSide}
        data-stack-first={stackFirst}
        data-narrow-fallback={narrowFallback}
      >
        {stackFirst === 'narrow' ? <div className={styles.narrow}>{narrow}</div> : null}
        <div className={styles.wide}>{wide}</div>
        {stackFirst === 'wide' ? <div className={styles.narrow}>{narrow}</div> : null}
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
