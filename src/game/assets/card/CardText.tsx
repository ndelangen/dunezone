import type { ComponentProps } from 'react';

import { FormattedText } from '../utils/FormattedText';
import styles from './CardText.module.css';

/** Shares the printed rules typography between treachery and custom cards. */
export function CardText({ value, className, ...props }: ComponentProps<'div'> & { value: string }) {
  return (
    <div {...props} className={`${styles.rules} ${className ?? ''}`}>
      <FormattedText value={value} />
    </div>
  );
}
