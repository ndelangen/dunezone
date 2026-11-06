import { Group, Stack } from '@mantine/core';

import styles from './SeatCard.module.css';
import type { SeatCardProps } from './SeatCard.types';
import { SeatLabeledActions, SeatLine } from './seatCardParts';

/** Option C: the seat's line, then Info and Chat as labelled actions side by side. */
export function SeatCardLabeled({ mention, onInfo, onChat }: SeatCardProps) {
  return (
    <Stack gap="xs" className={`${styles.card} ${styles.pad}`}>
      <SeatLine mention={mention} />
      {(onInfo || onChat) && (
        <Group gap="xs" grow>
          <SeatLabeledActions onInfo={onInfo} onChat={onChat} />
        </Group>
      )}
    </Stack>
  );
}
