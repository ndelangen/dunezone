import { Button, Group, Stack, Text } from '@mantine/core';
import { emptyPublicControls } from '@shared/play/inventory';
import { seatLabel } from '@shared/play/participation';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { TableRoster } from '@shared/play/schema';
import { Eyebrow } from '@ui/content/Eyebrow';
import { TopicIcon } from '@ui/content/TopicIcon';
import { NestedTabs } from '@ui/surface/NestedTabs';
import { useState } from 'react';

import type { TableConnection, TableProjection } from './TableConnection';

/*
 * The right rail of the play panel, as amended on #1016 (2026-09-19): one tab per seat in seat
 * order, the viewer's own seat last. Before public assignment a seat reads by its number; from
 * then on by its faction. The own tab carries the leave utilities; an open seat's tab offers to
 * take it; another player's tab names them. Conversation and Public state join their tabs with
 * their own deliveries, and nothing participation-related sits on the left rail.
 */

type RailProps = Readonly<{ client: TableConnection; table: TableProjection }>;
type Seat = TableRoster['seats'][number];

function seatName(seat: Seat): string {
  return seat.faction?.name ?? seatLabel(seat.id).replace(/^seat/, 'Seat');
}

/** What leaving costs, for the confirmation: the game, a roster place, or a seat left open. */
function leavingWords(table: TableProjection, seat: Seat): string {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  switch (true) {
    case controls.seats.length === 1:
      return 'You are the last player. Leaving discards the game for good.';
    case table.snapshot.stage === 'drafting':
      return 'Your place in the roster goes; the other players keep theirs.';
    default:
      return `${seatName(seat)} stays open with its faction for a replacement.`;
  }
}

function OwnSeat({ client, table, seat }: RailProps & Readonly<{ seat: Seat }>) {
  const [leaving, setLeaving] = useState(false);
  return (
    <Stack gap="sm">
      <Eyebrow tone="inverse">Your seat</Eyebrow>
      <Text fw={700}>{seatName(seat)}</Text>
      {leaving ? (
        <>
          <Text size="sm">{leavingWords(table, seat)}</Text>
          <Group gap="xs">
            <Button variant="default" onClick={() => setLeaving(false)}>
              Stay
            </Button>
            <Button
              color="red"
              disabled={table.seatCommandPending}
              onClick={() => client.participate({ kind: 'seat-depart' })}
            >
              Leave
            </Button>
          </Group>
        </>
      ) : (
        <>
          <Text size="sm" c="dimmed">
            Closing the tab keeps your seat. Leaving gives it up.
          </Text>
          <Group>
            <Button variant="default" onClick={() => setLeaving(true)}>
              Leave game
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

function OpenSeat({ client, table, seat }: RailProps & Readonly<{ seat: Seat }>) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const watching = table.viewer.viewerSeat === SPECTATOR_SEAT;
  const asked = controls.seatRequests.some((request) => request.own);
  const asking = controls.seatRequests.filter((request) => request.seat === seat.id).length;
  return (
    <Stack gap="sm">
      <Eyebrow tone="inverse">Open seat</Eyebrow>
      <Text fw={700}>{seatName(seat)}</Text>
      <Text size="sm" c="dimmed">
        {asking === 0
          ? 'Nobody has asked for it yet.'
          : `${asking} ${asking === 1 ? 'request waits' : 'requests wait'} for it.`}
      </Text>
      {watching && (
        <Group>
          <Button
            disabled={asked || table.seatCommandPending}
            onClick={() => client.participate({ kind: 'seat-request', seat: seat.id })}
          >
            Request this seat
          </Button>
        </Group>
      )}
    </Stack>
  );
}

function OtherSeat({ seat, holder }: Readonly<{ seat: Seat; holder: string | undefined }>) {
  return (
    <Stack gap="sm">
      <Eyebrow tone="inverse">Player</Eyebrow>
      <Text fw={700}>{seatName(seat)}</Text>
      <Text size="sm" c="dimmed">
        {holder ? `Held by ${holder}.` : 'Held by a player.'}
      </Text>
    </Stack>
  );
}

/** The seats of a real game as tabs, the viewer's own last; nothing on the fixture, which has no roster to speak of. */
export function SeatRail({ client, table }: RailProps) {
  const roster = table.snapshot.roster;
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const own = table.viewer.viewerSeat;
  const seats = [...(roster?.seats ?? [])]
    .sort((a, b) => a.position - b.position)
    .sort((a, b) => Number(a.id === own) - Number(b.id === own));
  const [chosen, setChosen] = useState<string | null>(null);
  const active = seats.find((seat) => seat.id === chosen) ?? seats.find((seat) => seat.id === own) ?? seats[0];
  if (!active) {
    return null;
  }
  const content = (seat: Seat) => {
    switch (true) {
      case seat.id === own:
        return <OwnSeat client={client} table={table} seat={seat} />;
      case !controls.seats.includes(seat.id):
        return <OpenSeat client={client} table={table} seat={seat} />;
      default:
        return <OtherSeat seat={seat} holder={controls.players.find((player) => player.seat === seat.id)?.name} />;
    }
  };
  return (
    <NestedTabs activePath={[active.id]} ariaLabel="Players" className="seated-controls-tabs">
      <NestedTabs.Level label="Players">
        {seats.map((seat) => (
          <NestedTabs.Item
            key={seat.id}
            as="button"
            type="button"
            path={[seat.id]}
            label={seat.id === own ? `${seatName(seat)} (you)` : seatName(seat)}
            icon={<TopicIcon topic={seat.faction ? 'factions' : 'groups'} size={22} />}
            onClick={() => setChosen(seat.id)}
          />
        ))}
      </NestedTabs.Level>
      <NestedTabs.ContentPanel className="seated-controls-tab-content">{content(active)}</NestedTabs.ContentPanel>
    </NestedTabs>
  );
}
