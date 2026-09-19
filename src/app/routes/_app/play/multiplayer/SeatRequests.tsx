import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { emptyPublicControls } from '@shared/play/inventory';
import { seatLabel } from '@shared/play/participation';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';
import { FormError } from '@ui/block/FormError';
import { Eyebrow } from '@ui/content/Eyebrow';
import { Surface } from '@ui/surface/Surface';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { darkSchemeIslandAttributes } from '../DarkSchemeIsland';
import styles from './SeatRequests.module.css';
import type { TableConnection, TableProjection } from './TableConnection';

/*
 * The important-decision bar for participation, in the accepted arrangement (#1016): who is
 * asking, what for, and the one action the viewer may take. A spectator asks for a place and can
 * withdraw; a player approves the next request or leaves the game. Nothing here is added to the
 * table, and the bar says nothing once a game is discarded except that it was.
 */
function DecisionBar({
  eyebrow,
  title,
  context,
  action,
}: Readonly<{ eyebrow: string; title: string; context: string; action?: ReactNode }>) {
  return (
    <Surface as="section" aria-label={eyebrow} padding="sm" className={styles.bar}>
      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        <Stack gap={2} miw={0} className={styles.copy}>
          <Eyebrow tone="inverse">{eyebrow}</Eyebrow>
          <Text fw={700}>{title}</Text>
          <Text size="sm" c="dimmed">
            {context}
          </Text>
        </Stack>
        {action}
      </Group>
    </Surface>
  );
}

function seatWords(table: TableProjection, seat: string | null): string {
  if (seat === null) {
    return 'a seat';
  }
  const faction = rosterSeat(table.snapshot.roster, seat)?.faction?.name;
  return faction ? `${seatLabel(seat)} (${faction})` : seatLabel(seat);
}

/** The seats nobody holds, once the seating is fixed; while drafting a request names no seat. */
function openSeats(table: TableProjection): string[] {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  return (table.snapshot.roster?.seats ?? []).map((seat) => seat.id).filter((seat) => !controls.seats.includes(seat));
}

function SpectatorBar({ client, table }: Readonly<{ client: TableConnection; table: TableProjection }>) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const drafting = table.snapshot.stage === 'drafting';
  const open = openSeats(table);
  const [chosen, setChosen] = useState<string | null>(null);
  const own = controls.seatRequests.find((request) => request.own);
  if (own) {
    return (
      <DecisionBar
        eyebrow="Seat requested"
        title="Waiting for a player to approve you"
        context={`You asked for ${seatWords(table, own.seat)}. Any current player can approve; until then you keep watching.`}
        action={
          <Button variant="default" onClick={() => client.participate({ kind: 'seat-withdraw' })}>
            Withdraw
          </Button>
        }
      />
    );
  }
  const seated = controls.seats.length;
  const seatCount = table.snapshot.roster?.seatCount ?? seated;
  const selected = chosen && open.includes(chosen) ? chosen : (open[0] ?? null);
  const full = drafting ? false : open.length === 0;
  return (
    <DecisionBar
      eyebrow="You are watching"
      title={full ? 'Every seat is taken' : 'Take a seat in this game?'}
      context={
        drafting
          ? `${seated} ${seated === 1 ? 'player is' : 'players are'} drafting. One current player's approval seats you; until then you watch.`
          : `${seated} of ${seatCount} seats are taken. One current player's approval seats you; until then you watch.`
      }
      action={
        <Group gap="xs" wrap="nowrap">
          {!drafting && open.length > 1 && (
            <Select
              aria-label="Open seat"
              attributes={{ dropdown: darkSchemeIslandAttributes }}
              data={open.map((seat) => ({ value: seat, label: seatWords(table, seat) }))}
              value={selected}
              onChange={setChosen}
              allowDeselect={false}
            />
          )}
          <Button
            disabled={full}
            onClick={() =>
              client.participate(
                drafting || !selected ? { kind: 'seat-request' } : { kind: 'seat-request', seat: selected }
              )
            }
          >
            {drafting || open.length !== 1 ? 'Request a seat' : `Request ${seatWords(table, open[0]!)}`}
          </Button>
        </Group>
      }
    />
  );
}

function PlayerBar({ client, table }: Readonly<{ client: TableConnection; table: TableProjection }>) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const [leaving, setLeaving] = useState(false);
  const request = controls.seatRequests[0];
  const drafting = table.snapshot.stage === 'drafting';
  const alone = controls.seats.length === 1;
  if (leaving) {
    return (
      <DecisionBar
        eyebrow="Leaving"
        title="Leave this game?"
        context={
          alone
            ? 'You are the last player. Leaving discards the game for good.'
            : drafting
              ? 'Your place in the roster goes; the other players keep theirs.'
              : `${seatLabel(table.viewer.viewerSeat)} stays open with its faction for a replacement.`
        }
        action={
          <Group gap="xs" wrap="nowrap">
            <Button variant="default" onClick={() => setLeaving(false)}>
              Stay
            </Button>
            <Button color="red" onClick={() => client.participate({ kind: 'seat-depart' })}>
              Leave
            </Button>
          </Group>
        }
      />
    );
  }
  const leave = (
    <Button variant="subtle" onClick={() => setLeaving(true)}>
      Leave game
    </Button>
  );
  if (!request) {
    return (
      <DecisionBar
        eyebrow="Your seat"
        title={`You hold ${seatWords(table, table.viewer.viewerSeat)}`}
        context="Nobody is asking for a seat right now."
        action={leave}
      />
    );
  }
  const more = controls.seatRequests.length - 1;
  const open = openSeats(table);
  const grantable = drafting || (request.seat !== null && open.includes(request.seat));
  return (
    <DecisionBar
      eyebrow="Seat request"
      title={`${request.requesterName} asks for ${seatWords(table, request.seat)}`}
      context={`${
        grantable ? 'Your approval seats them.' : 'That seat is taken now; the request cannot be granted.'
      }${more > 0 ? ` ${more} more ${more === 1 ? 'request waits' : 'requests wait'}.` : ''}`}
      action={
        <Group gap="xs" wrap="nowrap">
          {leave}
          <Button
            disabled={!grantable}
            onClick={() => client.participate({ kind: 'seat-approve', requestId: request.id })}
          >
            Approve
          </Button>
        </Group>
      }
    />
  );
}

/** The seat bar for the viewer's role, above the panel, on a real game only; the fixture seats its players itself. */
export function SeatRequests({
  client,
  table,
  error,
}: Readonly<{ client: TableConnection; table: TableProjection; error: string | null }>) {
  if (!table.snapshot.stage || table.playback) {
    return null;
  }
  const bar =
    table.snapshot.stage === 'discarded' ? (
      <DecisionBar
        eyebrow="Discarded"
        title="This game was discarded"
        context="Its last player left. The table stays readable; nobody can take a seat again."
      />
    ) : table.viewer.viewerSeat === SPECTATOR_SEAT ? (
      <SpectatorBar client={client} table={table} />
    ) : (
      <PlayerBar client={client} table={table} />
    );
  return (
    <div className={styles.dock} data-decision-bar="">
      {error && <FormError title="From the table">{error}</FormError>}
      {bar}
    </div>
  );
}
