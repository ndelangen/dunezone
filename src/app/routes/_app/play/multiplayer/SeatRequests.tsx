import { Button, Group, Menu, Select, Stack, Text } from '@mantine/core';
import { emptyPublicControls } from '@shared/play/inventory';
import { seatLabel } from '@shared/play/participation';
import type { SeatAction, SeatRequest } from '@shared/play/participation';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';
import { FormError } from '@ui/block/FormError';
import { Eyebrow } from '@ui/content/Eyebrow';
import { IconAction } from '@ui/control/IconAction';
import { Surface } from '@ui/surface/Surface';
import { EllipsisVertical } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import { darkSchemeIslandAttributes } from '../DarkSchemeIsland';
import styles from './SeatRequests.module.css';
import type { TableConnection, TableProjection } from './TableConnection';

/*
 * The important-decision bar for participation, in the accepted arrangement (#1016): who is
 * asking, what for, and the one action the viewer may take. A spectator asks for a place and can
 * withdraw; a player approves the next request, and confirms giving up their seat here after choosing
 * it in the game menu. Nothing is added to the table, and the bar says nothing once a game is
 * discarded except that it was.
 */
function DecisionBar({
  eyebrow,
  title,
  context,
  action,
}: Readonly<{ eyebrow: string; title: string; context: string; action?: ReactNode }>) {
  const labelId = useId();
  return (
    <Surface as="section" aria-labelledby={labelId} padding="sm" className={styles.bar}>
      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        <Stack gap={2} miw={0} className={styles.copy}>
          <Eyebrow tone="inverse" id={labelId}>
            {eyebrow}
          </Eyebrow>
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

type BarProps = Readonly<{ client: TableConnection; table: TableProjection }>;

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

/** The one button every bar action is: it waits while a seat command is on its way. */
function SeatButton({
  client,
  table,
  action,
  disabled = false,
  variant,
  color,
  children,
}: BarProps &
  Readonly<{
    action: SeatAction;
    disabled?: boolean;
    variant?: 'default' | 'subtle';
    color?: string;
    children: string;
  }>) {
  return (
    <Button
      variant={variant}
      color={color}
      disabled={disabled || table.seatCommandPending}
      onClick={() => client.participate(action)}
    >
      {children}
    </Button>
  );
}

function OwnRequestBar({ client, table, request }: BarProps & Readonly<{ request: SeatRequest }>) {
  return (
    <DecisionBar
      eyebrow="Seat requested"
      title="Waiting for a player to approve you"
      context={`You asked for ${seatWords(table, request.seat)}. Any current player can approve; until then you keep watching.`}
      action={
        <SeatButton client={client} table={table} action={{ kind: 'seat-withdraw' }} variant="default">
          Withdraw
        </SeatButton>
      }
    />
  );
}

function SpectatorBar({ client, table }: BarProps) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const drafting = table.snapshot.stage === 'drafting';
  const open = openSeats(table);
  const [chosen, setChosen] = useState<string | null>(null);
  const own = controls.seatRequests.find((request) => request.own);
  if (own) {
    return <OwnRequestBar client={client} table={table} request={own} />;
  }
  const seated = controls.seats.length;
  const seatCount = table.snapshot.roster?.seatCount ?? seated;
  const selected = chosen && open.includes(chosen) ? chosen : (open[0] ?? null);
  const full = !drafting && open.length === 0;
  const request: SeatAction =
    drafting || !selected ? { kind: 'seat-request' } : { kind: 'seat-request', seat: selected };
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
          <SeatButton client={client} table={table} action={request} disabled={full}>
            {drafting || open.length !== 1 ? 'Request a seat' : `Request ${seatWords(table, open[0]!)}`}
          </SeatButton>
        </Group>
      }
    />
  );
}

/** What leaving costs, for the confirmation: the game, a roster place, or a seat left open. */
function leavingWords(table: TableProjection): string {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  switch (true) {
    case controls.seats.length === 1:
      return 'You are the last player. Leaving discards the game for good.';
    case table.snapshot.stage === 'drafting':
      return 'Your place in the roster goes; the other players keep theirs.';
    default:
      return `${seatLabel(table.viewer.viewerSeat)} stays open with its faction for a replacement.`;
  }
}

function LeavingBar({ client, table, onStay }: BarProps & Readonly<{ onStay: () => void }>) {
  return (
    <DecisionBar
      eyebrow="Leaving"
      title="Give up your seat?"
      context={leavingWords(table)}
      action={
        <Group gap="xs" wrap="nowrap">
          <Button variant="default" onClick={onStay}>
            Stay
          </Button>
          <SeatButton client={client} table={table} action={{ kind: 'seat-depart' }} color="red">
            Leave
          </SeatButton>
        </Group>
      }
    />
  );
}

/**
 * The game menu in the header toolbar, in every stage, left of the phase controls that stay rightmost.
 * Its one item today gives up the viewer's seat;
 * the confirmation happens in the decision bar, never in a modal.
 * A spectator has no seat to give up.
 */
export function GameMenu({ table, onLeave }: Readonly<{ table: TableProjection; onLeave: () => void }>) {
  const seated = table.viewer.viewerSeat !== SPECTATOR_SEAT && table.snapshot.stage !== 'discarded';
  return (
    <Menu position="bottom-end" shadow="md" withinPortal>
      <Menu.Target>
        <IconAction
          label="Game menu"
          emphasis="standard"
          intent="neutral"
          size="sm"
          icon={<EllipsisVertical size={15} aria-hidden />}
        />
      </Menu.Target>
      <Menu.Dropdown {...darkSchemeIslandAttributes}>
        <Menu.Item color="red" disabled={!seated} onClick={onLeave}>
          Give up your seat
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function PlayerBar({ client, table }: BarProps) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const request = controls.seatRequests[0];
  if (!request) {
    return (
      <DecisionBar
        eyebrow="Your seat"
        title={`You hold ${seatWords(table, table.viewer.viewerSeat)}`}
        context="Nobody is asking for a seat right now."
      />
    );
  }
  const more = controls.seatRequests.length - 1;
  const grantable =
    table.snapshot.stage === 'drafting' || (request.seat !== null && openSeats(table).includes(request.seat));
  return (
    <DecisionBar
      eyebrow="Seat request"
      title={`${request.requesterName} asks for ${seatWords(table, request.seat)}`}
      context={`${
        grantable ? 'Your approval seats them.' : 'That seat is taken now; the request cannot be granted.'
      }${more > 0 ? ` ${more} more ${more === 1 ? 'request waits' : 'requests wait'}.` : ''}`}
      action={
        <SeatButton
          client={client}
          table={table}
          action={{ kind: 'seat-approve', requestId: request.id }}
          disabled={!grantable}
        >
          Approve
        </SeatButton>
      }
    />
  );
}

function barFor(client: TableConnection, table: TableProjection, leaving: boolean, onStay: () => void): ReactNode {
  switch (true) {
    case leaving && table.viewer.viewerSeat !== SPECTATOR_SEAT && table.snapshot.stage !== 'discarded':
      return <LeavingBar client={client} table={table} onStay={onStay} />;
    case table.snapshot.stage === 'discarded':
      return (
        <DecisionBar
          eyebrow="Discarded"
          title="This game was discarded"
          context="Its last player left. The table stays readable; nobody can take a seat again."
        />
      );
    case table.viewer.viewerSeat === SPECTATOR_SEAT:
      return <SpectatorBar client={client} table={table} />;
    default:
      return <PlayerBar client={client} table={table} />;
  }
}

/**
 * The seat bar for the viewer's role, above the panel, on a real game only;
 * the fixture seats its players itself.
 * Before play the bar is the only place a rejection can show;
 * in play the Table tab already shows it.
 */
export function SeatRequests({
  client,
  table,
  error,
  leaving,
  onStay,
}: BarProps & Readonly<{ error: string | null; leaving: boolean; onStay: () => void }>) {
  if (!table.snapshot.stage || table.playback) {
    return null;
  }
  return (
    <div className={styles.dock} data-decision-bar="">
      {error && table.snapshot.stage !== 'play' && <FormError title="From the table">{error}</FormError>}
      {barFor(client, table, leaving, onStay)}
    </div>
  );
}
