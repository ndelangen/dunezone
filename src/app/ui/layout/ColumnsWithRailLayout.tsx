import clsx from 'clsx';
import type { PropsWithChildren, ReactNode } from 'react';

import { collectSlots } from './collectSlots';
import styles from './ColumnsWithRailLayout.module.css';

const Primary: (props: PropsWithChildren) => null = () => null;

const Secondary: (props: PropsWithChildren) => null = () => null;

const Rail: (props: PropsWithChildren) => null = () => null;

/**
 * Two reading columns beside a narrow rail, top-aligned, responsive by container query.
 *
 * Every slot is text a reader works down, so they align to the top and the rail keeps a floor width rather than a share of the room.
 *
 * It gives up its columns in two stages instead of one: first the two reading columns merge into one while the rail keeps a column of its own, and only then does everything fall into a single column.
 * That middle stage exists because collapsing three columns straight into one buries the rail below everything else.
 * Merging primary into secondary keeps the order a reader wants (the prose, then the discussion of it) and leaves the rail where it already was, alongside.
 *
 * Callers own what goes in each slot and the page width around it;
 * this owns only where the three regions sit.
 *
 * Pass the slots as direct children, the way every kit Layout expects them: `Children.forEach` walks arrays but not fragments, so grouping them inside a `<>…</>` yields three empty columns and no error at all.
 */
function ColumnsWithRailLayoutBase({ className, children }: PropsWithChildren<{ className?: string }>) {
  const slots = collectSlots('ColumnsWithRailLayout', { Primary, Secondary, Rail }, children);
  const primary = slots.Primary?.children;
  const secondary = slots.Secondary?.children;
  const rail = slots.Rail?.children;

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
