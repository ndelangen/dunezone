import { Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

import type { SeatAlliance } from './seatAlliance';

/** What the top of a seat's Faction info shows and offers. */
export type FactionInfoHeaderModel = Readonly<{
  /** The faction's token, or the player's initial without one. */
  token: ReactNode;
  /** The player, or the faction's name for a vacant seat. */
  name: string;
  faction: string | null;
  /** The seat's id, such as `seat-2`, which a guide finds the seat's window by. */
  seatId: string;
  /** The seat as the header names it, such as Seat 2. */
  seat: string;
  own: boolean;
  alliance: SeatAlliance | null;
  page: Readonly<{ href: string; name: string }> | null;
  /** Starting a removal vote against the player, with why it cannot start yet. */
  removal: Readonly<{ start: () => void; disabledReason?: string }> | null;
}>;

/* The faction and seat under the name; a vacant seat is named by its faction already, so it gives the seat alone. */
function subtitle({ name, faction, seat }: FactionInfoHeaderModel) {
  return [faction === null ? 'No faction assigned' : faction !== name && faction, seat].filter(Boolean).join(' · ');
}

/**
 * The top row of a seat's Faction info: the token, and the name over the faction and seat.
 * Every action on the seat sits in the toolbar below it, never in this row.
 */
export function FactionInfoHeader({ model }: Readonly<{ model: FactionInfoHeaderModel }>) {
  return (
    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
      {model.token}
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Text fw={700} truncate>
          {model.own ? `${model.name} (you)` : model.name}
        </Text>
        <Text size="sm" c="dimmed" truncate>
          {subtitle(model)}
        </Text>
      </Stack>
    </Group>
  );
}
