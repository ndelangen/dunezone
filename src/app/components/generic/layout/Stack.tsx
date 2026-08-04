import clsx from 'clsx';
import type { ElementType, ReactNode } from 'react';

import styles from './Stack.module.css';

const gapClass = {
  1: styles.gap1,
  2: styles.gap2,
  3: styles.gap3,
  4: styles.gap4,
} as const;

export type StackGap = keyof typeof gapClass;

export type StackProps<T extends ElementType = 'div'> = {
  as?: T;
  gap?: StackGap;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

/**
 * Column flex layout with gap (spacing token). Use for page sections and form stacks instead of
 * margin chains on leaf components.
 */
export function Stack<T extends ElementType = 'div'>({
  as,
  gap = 3,
  className,
  children,
  ...rest
}: StackProps<T>) {
  const Component = (as ?? 'div') as ElementType;
  return (
    <Component className={clsx(styles.root, gapClass[gap], className)} {...rest}>
      {children}
    </Component>
  );
}
