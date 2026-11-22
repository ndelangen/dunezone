import clsx from 'clsx';

import styles from './FetchProgress.module.css';

type Props = {
  /** What is being fetched, as a screen reader announces the bar. */
  label: string;
  /** How many have come in; left out while the count is not known yet, which draws a bar that only says it is busy. */
  done?: number;
  total?: number;
  className?: string;
};

/** A thin bar that fills as files come in, such as a deck's card pictures fetched before a game starts. */
export function FetchProgress({ label, done, total, className }: Props) {
  const known = done !== undefined && total !== undefined && total > 0;
  return (
    <progress
      className={clsx(styles.bar, className)}
      aria-label={label}
      max={known ? total : undefined}
      value={known ? done : undefined}
    />
  );
}
