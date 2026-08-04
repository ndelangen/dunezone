import { cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';

import styles from './Form.module.css';

interface FormFieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}

export function FormField({ label, hint, error, children, htmlFor }: FormFieldProps) {
  const fieldId = useId();
  const hintId = hint != null ? `${fieldId}-hint` : undefined;
  const errorId = error != null ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  let child = children;
  if (isValidElement(children) && typeof children.type !== 'symbol') {
    const fieldChild = children as ReactElement<{
      'aria-describedby'?: string;
      'aria-invalid'?: boolean;
    }>;
    child = cloneElement(fieldChild, {
      'aria-describedby': [fieldChild.props['aria-describedby'], describedBy]
        .filter(Boolean)
        .join(' '),
      'aria-invalid': error != null ? true : fieldChild.props['aria-invalid'],
    });
  }

  return (
    <div className={styles.field}>
      {label != null && (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {hint != null && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {child}
      {error != null && (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
