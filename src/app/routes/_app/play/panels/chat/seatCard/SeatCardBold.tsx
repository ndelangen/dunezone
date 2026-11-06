import { Group } from '@mantine/core';

import styles from './SeatCard.module.css';
import type { SeatCardProps } from './SeatCard.types';
import { SeatLabeledActions, SeatLine } from './seatCardParts';

/** Option D: one line, both names bold with "is playing" dimmed, and labelled Info and Chat at its end. */
export function SeatCardBold({ mention, onInfo, onChat }: SeatCardProps) {
  return (
    <Group gap="sm" wrap="nowrap" className={`${styles.card} ${styles.tight}`}>
      <SeatLine mention={mention} strong />
      {(onInfo || onChat) && (
        <Group gap={4} wrap="nowrap">
          <SeatLabeledActions onInfo={onInfo} onChat={onChat} />
        </Group>
      )}
    </Group>
  );
}
