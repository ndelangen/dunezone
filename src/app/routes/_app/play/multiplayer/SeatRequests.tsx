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

import styles from './SeatRequests.module.css';
import type { TableProjection, TableSession } from './TableSession';

/*
 * The important-decision bar for participation, in the accepted arrangement (#1016): who is
 * asking, what for, and the one action the viewer may take. A spectator asks for a place and can
 * withdraw; a player approves the next request, and confirms giving up their seat here after choosing
 * it in the game menu. Nothing is added to the table, and the bar says nothing once a game is
 * discarded except that it was.
 */
export function DecisionBar({
  eyebrow,
  title,
  context,
  action,
  readiness,
}: Readonly<{ eyebrow: string; title: string; context: string; action?: ReactNode; readiness?: ReactNode }>) {
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
      {readiness && <div className={styles.readiness}>{readiness}</div>}
    </Surface>
  );
}

type BarProps = Readonly<{ client: TableSession; table: TableProjection; readiness?: ReactNode }>;

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
      disabled={disabled || table.seatCommandPending || table.reconnecting}
      onClick={() => client.command(action)}
    >
      {children}
    </Button>
  );
}

function OwnRequestBar({ client, table, request, readiness }: BarProps & Readonly<{ request: SeatRequest }>) {
  return (
    <DecisionBar
      readiness={readiness}
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

function SpectatorBar({ client, table, readiness }: BarProps) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const drafting = table.snapshot.stage === 'drafting';
  const open = openSeats(table);
  const [chosen, setChosen] = useState<string | null>(null);
  const own = controls.seatRequests.find((request) => request.own);
  if (own) {
    return <OwnRequestBar client={client} table={table} request={own} readiness={readiness} />;
  }
  const seated = controls.seats.length;
  const seatCount = table.snapshot.roster?.seatCount ?? seated;
  const selected = chosen && open.includes(chosen) ? chosen : (open[0] ?? null);
  const full = !drafting && open.length === 0;
  /* With no seat to ask for, the bar gives way to a removal vote or the end of the game, as a player's does. */
  if (full && !readiness && (table.snapshot.removalVotes?.length || table.snapshot.ending || table.snapshot.result)) {
    return null;
  }
  const request: SeatAction =
    drafting || !selected ? { kind: 'seat-request' } : { kind: 'seat-request', seat: selected };
  return (
    <DecisionBar
      readiness={readiness}
      eyebrow="You are watching"
      title={full ? 'Every seat is taken' : 'Take a seat in this game?'}
      context={
        drafting
          ? `${seated} ${seated === 1 ? 'player is' : 'players are'} drafting. One current player's approval seats you; until then you watch.`
          : full
            ? `All ${seatCount} seats are taken, so you watch. If a seat opens, you can ask for it here.`
            : `${seated} of ${seatCount} seats are taken. One current player's approval seats you; until then you watch.`
      }
      action={
        <Group gap="xs" wrap="nowrap">
          {!drafting && open.length > 1 && (
            <Select
              aria-label="Open seat"
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
 * It gives up the viewer's seat, with the confirmation in the decision bar, never in a modal;
 * a spectator has no seat to give up.
 * While a result's confetti is on the table it also stops and clears it, for this viewer alone.
 */
export function GameMenu({
  table,
  onLeave,
  onClearConfetti,
}: Readonly<{ table: TableProjection; onLeave: () => void; onClearConfetti?: () => void }>) {
  /* The fixture has no lifecycle, so a seat there is not one to give up; the table would refuse the departure. */
  const seated =
    table.viewer.viewerSeat !== SPECTATOR_SEAT &&
    table.snapshot.stage !== undefined &&
    table.snapshot.stage !== 'discarded';
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
      <Menu.Dropdown>
        {onClearConfetti && <Menu.Item onClick={onClearConfetti}>Clear confetti</Menu.Item>}
        <Menu.Item color="red" disabled={!seated} onClick={onLeave}>
          Give up your seat
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function PlayerBar({ client, table, readiness }: BarProps) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const request = controls.seatRequests[0];
  /* A removal vote or the end of the game has its own bar; "nobody is asking" would only add noise beside it.
     Past drafting it would only take height from the dock's tabs, so the bar comes back with the next request. */
  const otherBar = table.snapshot.removalVotes?.length || table.snapshot.ending || table.snapshot.result;
  if (!request && (otherBar || table.snapshot.stage !== 'drafting') && !readiness) {
    return null;
  }
  if (!request) {
    return (
      <DecisionBar
        readiness={readiness}
        eyebrow="Your seat"
        title={`You hold ${seatWords(table, table.viewer.viewerSeat)}`}
        context={
          table.snapshot.stage === 'drafting' && controls.seats.length === 1
            ? 'You are seated alone. Share the game link; approve seat requests here.'
            : 'Nobody is asking for a seat right now.'
        }
      />
    );
  }
  const more = controls.seatRequests.length - 1;
  const grantable =
    table.snapshot.stage === 'drafting' || (request.seat !== null && openSeats(table).includes(request.seat));
  return (
    <DecisionBar
      readiness={readiness}
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

/* A seated player drafting with others and no seat request to answer: the seat column shows who is at the table, and the seat number only matters once factions are dealt. */
function draftingIdle(table: TableProjection): boolean {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  return table.snapshot.stage === 'drafting' && controls.seatRequests.length === 0 && controls.seats.length > 1;
}

/* Drafting with nothing to ask, the bar is the draft summary and Ready on one row, so the faction list keeps the dock's height (#1633). */
function ReadinessBar({ readiness }: Readonly<{ readiness: ReactNode }>) {
  return (
    <Surface as="section" aria-label="Your seat" padding="sm" className={styles.bar}>
      {readiness}
    </Surface>
  );
}

function barFor(
  client: TableSession,
  table: TableProjection,
  leaving: boolean,
  onStay: () => void,
  readiness?: ReactNode
): ReactNode {
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
      return <SpectatorBar client={client} table={table} readiness={readiness} />;
    case Boolean(readiness) && draftingIdle(table):
      return <ReadinessBar readiness={readiness} />;
    default:
      return <PlayerBar client={client} table={table} readiness={readiness} />;
  }
}

/**
 * Playback of a stage before play, whose frame has no Phase tab to hold the playback controls.
 * The bar steps through the checkpoints and returns to the live table, as the Phase tab does in play.
 */
function PlaybackBar({ client, table, error }: BarProps & Readonly<{ error: string | null }>) {
  const { playback, historyPending } = table;
  if (!playback) {
    return null;
  }
  return (
    <div className={styles.dock} data-decision-bar="">
      {error && <FormError title="From the table">{error}</FormError>}
      <DecisionBar
        eyebrow="Playback"
        title={`Playback checkpoint ${playback.step} of ${playback.lastStep}`}
        context="Table actions are paused while you look back at the game."
        action={
          <Group gap="xs" wrap="nowrap" role="group" aria-label="Phase playback">
            <Button
              variant="default"
              disabled={historyPending || playback.step === 0}
              onClick={() => client.requestHistory(playback.step - 1)}
            >
              Earlier phase
            </Button>
            <Button
              variant="default"
              disabled={historyPending || playback.step === playback.lastStep}
              onClick={() => client.requestHistory(playback.step + 1)}
            >
              Later phase
            </Button>
            <Button variant="default" onClick={client.resumeLive}>
              Return to live
            </Button>
          </Group>
        }
      />
    </div>
  );
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
  readiness,
}: BarProps & Readonly<{ error: string | null; leaving: boolean; onStay: () => void }>) {
  if (!table.snapshot.stage) {
    return null;
  }
  if (table.playback) {
    /* In play the Phase tab carries playback; any earlier stage's frame has no such tab. */
    return table.snapshot.stage === 'play' ? null : <PlaybackBar client={client} table={table} error={error} />;
  }
  return (
    <div className={styles.dock} data-decision-bar="">
      {error && table.snapshot.stage !== 'play' && <FormError title="From the table">{error}</FormError>}
      {barFor(client, table, leaving, onStay, readiness)}
    </div>
  );
}
