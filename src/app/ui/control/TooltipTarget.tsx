import type { ComponentPropsWithRef, ReactNode } from 'react';

import styles from './TooltipTarget.module.css';

export interface TooltipTargetProps extends Omit<ComponentPropsWithRef<'span'>, 'className' | 'style'> {
  /** The one control the tooltip explains. */
  children: ReactNode;
}

/**
 * The element a `Tooltip` listens on when the control it explains can be disabled.
 * Firefox and Safari send a disabled button no pointer events, so a tooltip on the button itself never opens while it is disabled, which is often when its words matter most.
 * The control stays as it is inside;
 * only the pointer passes through it while it is disabled.
 * A pointer handler the control needs while disabled, such as a right-click that must not reach the table, goes on the target.
 */
export function TooltipTarget({ children, ...span }: TooltipTargetProps) {
  return (
    <span {...span} className={styles.target}>
      {children}
    </span>
  );
}
