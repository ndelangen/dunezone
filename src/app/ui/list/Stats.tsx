import { Box, Group, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import type { ReactNode } from 'react';

import styles from './Stats.module.css';

interface StatsItem {
  key: string;
  icon: ReactNode;
  value: ReactNode;
  /**
   * The fact as a full phrase, e.g.
   * `3 factions`.
   * Shown outright in a column, and on hover and to assistive tech in a row.
   * A bare glyph and number is not readable on its own.
   */
  label: string;
  /** Column layout only: the short noun beside the number. Defaults to `label`. */
  name?: ReactNode;
}

export interface StatsProps {
  items: StatsItem[];
  /**
   * `row` packs the counts into a strip and defers the labels to hover and assistive tech;
   * `column` gives every count its own labelled line.
   */
  orientation?: 'row' | 'column';
}

/** Row layout: the glyph and number are decorative together; the phrase carries the meaning. */
function CompactStat({ icon, value, label }: StatsItem) {
  return (
    <Tooltip label={label} openDelay={250}>
      <Group component="span" gap={6} wrap="nowrap">
        <Box component="span" c="dimmed" display="inline-flex" aria-hidden>
          {icon}
        </Box>
        <Text component="span" fw={700} lh={1} aria-hidden>
          {value}
        </Text>
        <VisuallyHidden>{label}</VisuallyHidden>
      </Group>
    </Tooltip>
  );
}

/**
 * Summarises one subject as a set of counted facts.
 *
 * Callers own which facts matter and how to phrase them.
 * This component owns that the facts read as one group (shared icon treatment, shared number weight, shared spacing), and it owns the single decision that separates the two shapes: whether the labels are visible or deferred to hover.
 * Both shapes stay accessible either way, which is the part that kept getting dropped when each "At a glance" panel hand-rolled its own.
 */
export function Stats({ items, orientation = 'row' }: StatsProps) {
  if (orientation === 'row') {
    return (
      <Group gap="lg" wrap="wrap">
        {items.map((item) => (
          <CompactStat {...item} key={item.key} />
        ))}
      </Group>
    );
  }

  return (
    <div className={styles.column}>
      {items.map((item) => (
        <div className={styles.entry} key={item.key}>
          <Box component="span" c="dimmed" display="inline-flex" aria-hidden>
            {item.icon}
          </Box>
          <Text component="span" fw={700} lh={1} aria-hidden>
            {item.value}
          </Text>
          <Text component="span" c="dimmed" size="sm" aria-hidden>
            {item.name ?? item.label}
          </Text>
          <VisuallyHidden>{item.label}</VisuallyHidden>
        </div>
      ))}
    </div>
  );
}
