import { Group } from '@mantine/core';

import styles from './SeatCard.module.css';
import type { SeatCardProps } from './SeatCard.types';
import { SeatIconActions, SeatLine } from './seatCardParts';

/** Option A: the seat's line with Info and Chat as quiet icons at its end, behind a rule. */
export function SeatCardInline({ mention, onInfo, onChat }: SeatCardProps) {
  return (
    <Group gap="sm" wrap="nowrap" className={`${styles.card} ${styles.tight}`}>
      <SeatLine mention={mention} />
      {(onInfo || onChat) && (
        <Group gap={2} wrap="nowrap" className={styles.divided}>
          <SeatIconActions onInfo={onInfo} onChat={onChat} size="md" emphasis="quiet" />
        </Group>
      )}
    </Group>
  );
}
