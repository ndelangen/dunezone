import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './ColumnsWithRailLayout.module.css';

function Primary(_: PropsWithChildren): null {
  return null;
}

function Secondary(_: PropsWithChildren): null {
  return null;
}

function Rail(_: PropsWithChildren): null {
  return null;
}

/**
 * Two reading columns beside a narrow rail, top-aligned, responsive by container query.
 *
 * Distinct from `TriptychLayout`, which centres its slots vertically around a middle panel holding artwork.
 * Here every slot is text a reader works down, so they align to the top and the rail keeps a floor width rather than a share of the room.
 *
 * It gives up its columns in two stages instead of one: first the rail moves up beside the secondary column while the primary keeps its width, and only then does everything stack.
 * That middle stage exists because collapsing a narrow rail straight into the reading flow buries it below content it was meant to sit beside.
 *
 * Callers own what goes in each slot and the page width around it;
 * this owns only where the three regions sit.
 */
function ColumnsWithRailLayoutBase({ className, children }: PropsWithChildren<{ className?: string }>) {
  let primary: ReactNode = null;
  let secondary: ReactNode = null;
  let rail: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (child.type === Primary) {
      primary = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Secondary) {
      secondary = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Rail) {
      rail = (child.props as PropsWithChildren).children;
    }
  });

  return (
    <div className={clsx(styles.root, className)}>
      <div className={styles.layout}>
        <div className={styles.primary}>{primary}</div>
        <div className={styles.secondary}>{secondary}</div>
        <div className={styles.rail}>{rail}</div>
      </div>
    </div>
  );
}

type ColumnsWithRailLayoutComponent = ((props: PropsWithChildren<{ className?: string }>) => ReactNode) & {
  Primary: typeof Primary;
  Secondary: typeof Secondary;
  Rail: typeof Rail;
};

export const ColumnsWithRailLayout = Object.assign(ColumnsWithRailLayoutBase, {
  Primary,
  Secondary,
  Rail,
}) as ColumnsWithRailLayoutComponent;
