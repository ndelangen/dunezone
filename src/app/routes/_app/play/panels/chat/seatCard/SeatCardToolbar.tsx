import { Group, Stack } from '@mantine/core';

import styles from './SeatCard.module.css';
import type { SeatCardProps } from './SeatCard.types';
import { SeatIconActions, SeatLine } from './seatCardParts';

/** Option B: the seat's line, then a toolbar of icon actions under a rule, as Faction info has. */
export function SeatCardToolbar({ mention, onInfo, onChat }: SeatCardProps) {
  return (
    <Stack gap={0} className={styles.card}>
      <div className={styles.tight}>
        <SeatLine mention={mention} />
      </div>
      {(onInfo || onChat) && (
        <Group gap="xs" justify="flex-end" className={styles.toolbar}>
          <SeatIconActions onInfo={onInfo} onChat={onChat} />
        </Group>
      )}
    </Stack>
  );
}
