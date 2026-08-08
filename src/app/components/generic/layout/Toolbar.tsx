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
    <div className={clsx(styles.root, className)} {...rest}>
      <div className={styles.left}>{left}</div>
      <div className={styles.center}>{center}</div>
      <div className={styles.right}>{right}</div>
    </div>
  );
};

export const Toolbar = Object.assign(ToolbarBase, {
  Left,
  Center,
  Right,
}) as ToolbarComponent;
