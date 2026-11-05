import { Avatar, Group, Stack, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { Eyebrow } from '@ui/content/Eyebrow';
import { ProfileLink } from '@ui/content/ProfileLink';
import { IconAction } from '@ui/control/IconAction';
import { Armchair } from 'lucide-react';

import { SEATS_HELP } from '../../multiplayer/panelGuidance';

/** One spectator's open request for a seat, as every viewer sees it. */
export type SeatRequestRow = Readonly<{
  id: string;
  name: string;
  /** What is asked for, such as "seat 3 (Fremen)", or "a place in the draft". */
  asks: string;
  /** The viewer's own request. */
  own: boolean;
  /** Why it cannot be approved right now, such as the seat being taken since; undefined while it can. */
  closed?: string;
}>;

/** One signed-in spectator, by their public name and avatar. */
export type SpectatorRow = Readonly<{ name: string; avatar: string | null; slug: string | null }>;

export type SeatsPanelProps = Readonly<{
  /** How the seats stand, such as "5 of 6 seats taken". */
  seats: string;
  requests: readonly SeatRequestRow[];
  spectators: readonly SpectatorRow[];
  /** How many watch signed out; they are counted, never named. */
  guests: number;
  /**
   * A player's approval, or null for an observer or a finished game, who see no action at all.
   * `disabledReason` greys it for a moment, while the table reconnects or a seat command is on its way.
   */
  approve: Readonly<{ disabledReason?: string; onApprove: (requestId: string) => void }> | null;
}>;

/* The size ProfileLink gives its avatar, so a spectator without a profile lines up with one who has one. */
const AVATAR = 24;

/* A spectator by their avatar and name: a link to their profile when they have one, the avatar and name alone otherwise. */
function Spectator({ spectator }: Readonly<{ spectator: SpectatorRow }>) {
  if (spectator.slug) {
    return <ProfileLink slug={spectator.slug} name={spectator.name} image={spectator.avatar} underline="hover" />;
  }
  return (
    <Group gap="xs" wrap="nowrap">
      <Avatar src={spectator.avatar} size={AVATAR} radius="50%" alt="">
        {spectator.name.slice(0, 1)}
      </Avatar>
      <Text size="sm">{spectator.name}</Text>
    </Group>
  );
}

/* The signed-out watchers, as one count after the names. */
function guestLine(guests: number, named: number) {
  const more = named > 0 ? ' more' : '';
  return guests === 1 ? `1${more} watching signed out` : `${guests}${more} watching signed out`;
}

function Requests({ requests, approve }: Pick<SeatsPanelProps, 'requests' | 'approve'>) {
  return (
    <Stack gap="xs" component="section" aria-label="Seat requests">
      <Eyebrow>Seat requests</Eyebrow>
      {requests.map((request) => (
        <Group key={request.id} gap="sm" justify="space-between" wrap="nowrap">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="sm" truncate>
              <strong>{request.own ? `${request.name} (you)` : request.name}</strong> asks for {request.asks}
            </Text>
            {request.closed && (
              <Text size="xs" c="dimmed">
                {request.closed}
              </Text>
            )}
          </Stack>
          {approve && !request.own && !request.closed && (
            /* Keyed by the request, so a press that began on one request never approves the next. */
            <IconAction
              key={request.id}
              label={`Approve ${request.name}`}
              tooltip={`Seat ${request.name} at ${request.asks}. One player's approval is enough.`}
              icon={<Armchair size={16} aria-hidden />}
              intent="positive"
              emphasis="standard"
              disabledReason={approve.disabledReason}
              onClick={() => approve.onApprove(request.id)}
            />
          )}
        </Group>
      ))}
    </Stack>
  );
}

function Spectators({ spectators, guests }: Pick<SeatsPanelProps, 'spectators' | 'guests'>) {
  const count = spectators.length + guests;
  return (
    <Stack gap="xs" component="section" aria-label="Spectators">
      <Eyebrow>{count ? `Spectators · ${count}` : 'Spectators'}</Eyebrow>
      {spectators.map((spectator, index) => (
        <Spectator key={`${spectator.slug ?? spectator.name}:${index}`} spectator={spectator} />
      ))}
      {guests > 0 && (
        <Text size="sm" c="dimmed">
          {guestLine(guests, spectators.length)}
        </Text>
      )}
      {count === 0 && (
        <Text size="sm" c="dimmed">
          Nobody is watching.
        </Text>
      )}
    </Stack>
  );
}

/**
 * The Seats & spectators window: how the seats stand, the open requests for a seat with a player's Approve beside each, and everyone watching.
 * It opens for every player when a spectator asks for a seat.
 */
export function SeatsPanel({ seats, requests, spectators, guests, approve }: SeatsPanelProps) {
  return (
    <Section hiddenHeading title="Seats & spectators" description={SEATS_HELP}>
      <Stack gap="md">
        <Text size="sm" fw={700}>
          {seats}
        </Text>
        {requests.length > 0 && <Requests requests={requests} approve={approve} />}
        <Spectators spectators={spectators} guests={guests} />
      </Stack>
    </Section>
  );
}
