import { Group } from '@mantine/core';

import styles from './CountHeading.module.css';
import { Eyebrow } from './Eyebrow';

export interface CountHeadingProps {
  /** What is counted, as a field's caption. */
  label: string;
  /** The count, printed large beside it. */
  value: number;
}

/**
 * A field's caption with its count printed large beside it, for a slider whose value should read at a glance.
 *
 * The large figure repeats what the control already says, so it is hidden from assistive tech.
 */
export function CountHeading({ label, value }: CountHeadingProps) {
  return (
    <Group justify="space-between" align="baseline" wrap="nowrap">
      <Eyebrow>{label}</Eyebrow>
      <span className={styles.count} aria-hidden>
        {value}
      </span>
    </Group>
  );
}
