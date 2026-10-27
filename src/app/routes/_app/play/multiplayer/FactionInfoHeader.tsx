import { Group, Stack, Text } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { ExternalLink, UserX } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SeatAlliance } from './Alliances';

/** What the top of a seat's Faction info shows and offers. */
export type FactionInfoHeaderModel = Readonly<{
  /** The faction's token, or the player's initial without one. */
  token: ReactNode;
  /** The player, or the faction's name for a vacant seat. */
  name: string;
  faction: string | null;
  /** The seat's id, such as `seat-2`, which a guide finds the header by. */
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
 * The top of a seat's Faction info: the token and name as a header, with the faction page and a removal vote as quiet icons beside it.
 * The alliance, the action players reach for most, has its own row below.
 */
export function FactionInfoHeader({ model }: Readonly<{ model: FactionInfoHeaderModel }>) {
  const { page, removal, alliance } = model;
  return (
    /* The seat it shows, for a guide that points at one player's header. */
    <Stack gap="sm" data-faction-info-seat={model.seatId}>
      <Group gap="xs" justify="space-between" wrap="nowrap">
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
        <Group gap={6} wrap="nowrap">
          {page && (
            <IconAction
              label={`Open the ${page.name} page in a new tab`}
              intent="neutral"
              emphasis="quiet"
              icon={<ExternalLink size={16} />}
              href={page.href}
              target="_blank"
              rel="noreferrer"
            />
          )}
          {removal && (
            <IconAction
              label="Start removal vote"
              intent="neutral"
              emphasis="quiet"
              icon={<UserX size={16} />}
              disabledReason={removal.disabledReason}
              onClick={removal.start}
            />
          )}
        </Group>
      </Group>
      {alliance && (
        <Group gap="sm" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            {alliance.mark}
            <Text size="sm">{alliance.status}</Text>
          </Group>
          {alliance.action}
        </Group>
      )}
    </Stack>
  );
}
