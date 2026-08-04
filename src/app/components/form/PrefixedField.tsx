import clsx from 'clsx';
import { Children, cloneElement, isValidElement } from 'react';
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

import styles from './Form.module.css';
import { textFieldClassNames } from './TextField';

type EmbeddableChildProps = {
  appearance?: 'embedded';
};

export interface PrefixedFieldProps extends Pick<ComponentPropsWithoutRef<'div'>, 'className'> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  children: ReactElement<EmbeddableChildProps>;
  prefixClassName?: string;
  mainClassName?: string;
  suffixClassName?: string;
}

export function PrefixedField({
  prefix,
  suffix,
  children,
  className,
  prefixClassName,
  mainClassName,
  suffixClassName,
}: PrefixedFieldProps) {
  let embeddedChild: ReactNode = children;
  const count = Children.count(children);
  if (!isValidElement(children) || count !== 1) {
    if (import.meta.env.DEV) {
      console.warn(
        'PrefixedField expects exactly one embeddable React element child. Rendering fallback child as-is.'
      );
    }
  } else {
    embeddedChild = cloneElement(children, { appearance: 'embedded' });
  }

  return (
    <div
      className={clsx(
        textFieldClassNames({ variant: 'input', padded: false }),
        styles.prefixedInput,
        className
      )}
    >
      {prefix != null && (
        <div className={clsx(styles.prefixedPrefix, prefixClassName)}>{prefix}</div>
      )}
      <div className={clsx(styles.prefixedMain, mainClassName)}>{embeddedChild}</div>
      {suffix != null && (
        <div className={clsx(styles.prefixedSuffix, suffixClassName)}>{suffix}</div>
      )}
    </div>
  );
}

/** @deprecated Use `PrefixedField` instead. */
export const FormPrefixedInput = PrefixedField;
