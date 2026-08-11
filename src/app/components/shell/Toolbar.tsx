import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { ComponentPropsWithoutRef, PropsWithChildren, ReactNode } from 'react';

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
 * The band of page-level controls beneath the hero.
 *
 * Owns the whole band, including the pane it sits on — a page hands it controls, never chrome. It
 * lives in the app shell rather than the interface kit because it is a fixed part of this
 * application's page furniture, not a general arrangement primitive.
 */
export type ToolbarProps = {
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'>;

type ToolbarComponent = ((props: ToolbarProps) => ReactNode) & {
  Left: typeof Left;
  Center: typeof Center;
  Right: typeof Right;
};

const ToolbarBase = ({ className, children, ...rest }: ToolbarProps) => {
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
      <div className={clsx(styles.root, className)} {...rest}>
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
