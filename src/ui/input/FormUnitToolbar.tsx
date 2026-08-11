import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './Form.module.css';

interface FormUnitToolbarProps {
  leading?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function FormUnitToolbar({ leading, center, actions, className }: FormUnitToolbarProps) {
  return (
    <div className={clsx(styles.unitToolbar, className)}>
      <div className={styles.unitToolbarLeading}>{leading}</div>
      <div className={styles.unitToolbarCenter}>
        {center ?? <span className={styles.unitToolbarCenterPlaceholder} aria-hidden />}
      </div>
      <div className={styles.unitToolbarActions}>{actions}</div>
    </div>
  );
}
