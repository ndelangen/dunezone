import clsx from 'clsx';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

import styles from './TextField.module.css';

export type TextFieldVariant = 'input' | 'textarea';
export type TextFieldAppearance = 'embedded';

export function textFieldClassNames(options?: {
  variant?: TextFieldVariant;
  padded?: boolean;
  embedded?: boolean;
}): string {
  const variant = options?.variant ?? 'input';
  const padded = options?.padded ?? false;
  const embedded = options?.embedded ?? false;
  return clsx(
    variant === 'textarea' ? styles.textarea : styles.input,
    padded && styles.padded,
    embedded && styles.embedded
  );
}

export type TextFieldProps = Omit<ComponentPropsWithoutRef<'input'>, 'className'> & {
  className?: string;
  appearance?: TextFieldAppearance;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { className, appearance, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={clsx(
        textFieldClassNames({
          variant: 'input',
          padded: true,
          embedded: appearance === 'embedded',
        }),
        className
      )}
      {...rest}
    />
  );
});
