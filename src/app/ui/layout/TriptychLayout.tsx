import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './TriptychLayout.module.css';
import { warnDroppedChild } from './warnDroppedChild';

const TRIPTYCH_SLOTS = ['TriptychLayout.Left', 'TriptychLayout.Center', 'TriptychLayout.Right'] as const;

function Left(_: PropsWithChildren): null {
  return null;
}

function Center(_: PropsWithChildren<{ className?: string }>): null {
  return null;
}

function Right(_: PropsWithChildren): null {
  return null;
}

/** Three columns (the outer two fixed, the centre flowing), responsive by container query. */
function TriptychLayoutBase({ className, children }: PropsWithChildren<{ className?: string }>) {
  let left: ReactNode = null;
  let center: ReactNode = null;
  let centerClassName: string | undefined;
  let right: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      warnDroppedChild('TriptychLayout', TRIPTYCH_SLOTS, child);
      return;
    }
    if (child.type === Left) {
      left = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Center) {
      const props = child.props as PropsWithChildren<{ className?: string }>;
      center = props.children;
      centerClassName = props.className;
      return;
    }
    if (child.type === Right) {
      right = (child.props as PropsWithChildren).children;
      return;
    }
    warnDroppedChild('TriptychLayout', TRIPTYCH_SLOTS, child);
  });

  return (
    <div className={clsx(styles.root, className)}>
      <div className={styles.layout}>
        <div>{left}</div>
        <div className={styles.center}>
          <div className={clsx(styles.centerFill, centerClassName)}>{center}</div>
        </div>
        <div>{right}</div>
      </div>
    </div>
  );
}

type TriptychLayoutComponent = ((props: PropsWithChildren<{ className?: string }>) => ReactNode) & {
  Left: typeof Left;
  Center: typeof Center;
  Right: typeof Right;
};

export const TriptychLayout = Object.assign(TriptychLayoutBase, {
  Left,
  Center,
  Right,
}) as TriptychLayoutComponent;
