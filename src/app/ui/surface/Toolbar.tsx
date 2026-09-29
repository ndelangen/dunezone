import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './Toolbar.module.css';

type ToolbarSlotProps = PropsWithChildren;

function Left({ children }: ToolbarSlotProps) {
  return <>{children}</>;
}

function Center({ children }: ToolbarSlotProps) {
  return <>{children}</>;
}

function Right({ children }: ToolbarSlotProps) {
  return <>{children}</>;
}

/**
 * A pane of controls, divided into what leads, what labels, and what acts.
 *
 * Callers own the controls.
 * This owns the band they sit in: the pane, its gutter, and the three positions.
 * `Left` and `Right` share the remaining width and pull to their outer edges, while `Center` takes only the room it needs.
 *
 * The edges hold their width by default, so a crowded band squeezes the centre and never the controls.
 * `edges="shrink"` lets them give way down to their widest unbreakable piece instead, which is what a `Group wrap="wrap"` inside an edge needs before it can wrap.
 * It is opt-in because the floor only holds while everything inside the edge either wraps or keeps its automatic minimum width.
 * A piece that sets `min-width: 0` lets the edge shrink below its controls and paint over its neighbour, as `AuthoringToolbar`'s `nowrap` actions would.
 *
 * It is a surface, so it must not be placed inside one.
 * A page hands it controls, never chrome;
 * there is no variant of this without the pane, because a bare row of buttons is a `Group`.
 */
export type ToolbarProps = {
  /** Whether the edges keep their content's width (`hold`, the default) or may shrink so wrapping content inside them wraps (`shrink`). */
  edges?: 'hold' | 'shrink';
  className?: string;
  children?: ReactNode;
};

type ToolbarComponent = ((props: ToolbarProps) => ReactNode) & {
  Left: typeof Left;
  Center: typeof Center;
  Right: typeof Right;
};

const ToolbarBase = ({ edges = 'hold', className, children }: ToolbarProps) => {
  let left: ReactNode = null;
  let center: ReactNode = null;
  let right: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement<ToolbarSlotProps>(child)) {
      return;
    }

    if (child.type === Left) {
      left = child.props.children;
      return;
    }

    if (child.type === Center) {
      center = child.props.children;
      return;
    }

    if (child.type === Right) {
      right = child.props.children;
    }
  });

  return (
    <Surface padding="sm">
      <div className={clsx(styles.root, edges === 'shrink' && styles.shrinkingEdges, className)}>
        <div className={styles.left}>{left}</div>
        <div className={styles.center}>{center}</div>
        <div className={styles.right}>{right}</div>
      </div>
    </Surface>
  );
};

export const Toolbar = Object.assign(ToolbarBase, {
  Left,
  Center,
  Right,
}) as ToolbarComponent;
