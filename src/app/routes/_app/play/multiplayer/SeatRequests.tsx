import { Button, Group, Menu, Popover, Select, Slider, Stack, Text } from '@mantine/core';
import { emptyPublicControls } from '@shared/play/inventory';
import { seatLabel, seatSubject } from '@shared/play/participation';
import type { SeatAction } from '@shared/play/participation';
import { rosterSeat, SPECTATOR_SEAT } from '@shared/play/schema';
import { Link } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { Eyebrow } from '@ui/content/Eyebrow';
import { ConfirmDeleteMenuItem } from '@ui/control/ConfirmDeleteMenuItem';
import { IconAction } from '@ui/control/IconAction';
import { Armchair, Settings } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import {
  setTableLighting,
  TABLE_LIGHTING_MAX,
  TABLE_LIGHTING_MIN,
  useTableLighting,
} from '../../../../widgets/tabletop/tableLighting';
import { TABLE_LABEL_OPTIONS, useTableLabels } from '../tableLabels';

/*
 * Participation without a bar between the board and the controls (Norbert, 2026-10-11): a spectator asks from the
 * Seats popover in the header (or the (+) in the drafting roster), a player approves where the seat is shown (the
 * drafting roster, or the vacant seat's Info in play), and giving up a seat is held in the game menu.
 */

type BarProps = Readonly<{ client: TableSession; table: TableProjection }>;

function seatWords(table: TableProjection, seat: string | null, label: (seat: string) => string = seatLabel): string {
  if (seat === null) {
    return 'a seat';
  }
  const faction = rosterSeat(table.snapshot.roster, seat)?.faction?.name;
  return faction ? `${label(seat)} (${faction})` : label(seat);
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

type SeatNotice = Readonly<{ eyebrow: string; title: string; context?: string; action?: ReactNode }>;

/** What a spectator's seat says and the one action it offers, or nothing once there is nothing to say. */
function useSpectatorSeat(client: TableSession, table: TableProjection): SeatNotice | null {
  const [chosen, setChosen] = useState<string | null>(null);
  const controls = table.snapshot.controls ?? emptyPublicControls();
  if (table.viewer.viewerSeat !== SPECTATOR_SEAT || !table.snapshot.stage || table.snapshot.stage === 'discarded') {
    return null;
  }
  const own = controls.seatRequests.find((request) => request.own);
  if (own) {
    return {
      eyebrow: 'Seat requested',
      ...(table.snapshot.stage === 'finished'
        ? { title: 'This game has finished', context: 'Nobody can take a seat now. Withdraw the request to clear it.' }
        : /* The table keeps a request for a seat someone else took, so it can be approved if that seat opens again. */
          table.snapshot.stage !== 'drafting' && own.seat !== null && !openSeats(table).includes(own.seat)
          ? {
              title: `${seatWords(table, own.seat, seatSubject)} is taken now`,
              context: 'A player can approve you if it opens again. Withdraw to ask for another seat.',
            }
          : {
              title: 'Waiting for a player to approve you',
              context: `You asked for ${seatWords(table, own.seat)}. Any current player can approve; until then you keep watching.`,
            }),
      action: (
        <SeatButton client={client} table={table} action={{ kind: 'seat-withdraw' }} variant="default">
          Withdraw
        </SeatButton>
      ),
    };
  }
  if (table.snapshot.stage === 'finished') {
    return null;
  }
  const drafting = table.snapshot.stage === 'drafting';
  const open = openSeats(table);
  const seated = controls.seats.length;
  const seatCount = table.snapshot.roster?.seatCount ?? seated;
  /* A full game has nothing to ask for; the notice says so and grows back into a request when a seat opens. */
  if (!drafting && open.length === 0) {
    return { eyebrow: 'You are watching', title: `All ${seatCount} seats are taken` };
  }
  const selected = chosen && open.includes(chosen) ? chosen : (open[0] ?? null);
  const request: SeatAction =
    drafting || !selected ? { kind: 'seat-request' } : { kind: 'seat-request', seat: selected };
  return {
    eyebrow: 'You are watching',
    title: 'Take a seat in this game?',
    context: drafting
      ? `${seated} ${seated === 1 ? 'player is' : 'players are'} drafting. One current player's approval seats you; until then you watch.`
      : `${seated} of ${seatCount} seats are taken. One current player's approval seats you; until then you watch.`,
    action: (
      <Group gap="xs" wrap="wrap">
        {!drafting && open.length > 1 && (
          <Select
            aria-label="Open seat"
            data={open.map((seat) => ({ value: seat, label: seatWords(table, seat) }))}
            value={selected}
            onChange={setChosen}
            allowDeselect={false}
            comboboxProps={{ withinPortal: false }}
          />
        )}
        {/* Keyed by the seat it asks for, so a press that began before that seat was taken never requests another. */}
        <SeatButton key={request.seat ?? 'any'} client={client} table={table} action={request}>
          {drafting || open.length !== 1 ? 'Request a seat' : `Request ${seatWords(table, open[0]!)}`}
        </SeatButton>
      </Group>
    ),
  };
}

/**
 * A spectator's seat, behind one action in the header toolbar beside the game menu (Norbert, 2026-10-02).
 * The dock keeps its height for the table's tabs, and the header keeps its one row.
 */
export function SeatPopover({
  client,
  table,
  error,
}: Readonly<{ client: TableSession; table: TableProjection; error: string | null }>) {
  const notice = useSpectatorSeat(client, table);
  /* The open state lives with the notice, so a seat that comes and goes never brings the popover back already open.
     Playback shows a past snapshot, so its seat actions would be stale; the dock drops them then too. */
  return notice && !table.playback ? <SeatNoticePopover notice={notice} error={error} /> : null;
}

function SeatNoticePopover({ notice, error }: Readonly<{ notice: SeatNotice; error: string | null }>) {
  const [opened, setOpened] = useState(false);
  const labelId = useId();
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      width="min(340px, calc(100vw - 2rem))"
      withArrow
    >
      <Popover.Target>
        <IconAction
          label="Seats"
          emphasis="standard"
          intent="neutral"
          size="sm"
          onClick={() => setOpened((current) => !current)}
          icon={<Armchair size={15} aria-hidden />}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <Stack component="section" aria-labelledby={labelId} gap="sm">
          {/* The copy is a polite status, so a change while it is open is heard, not only seen. */}
          <Stack gap={2} role="status">
            <Eyebrow id={labelId}>{notice.eyebrow}</Eyebrow>
            <Text fw={700}>{notice.title}</Text>
            {notice.context && (
              <Text size="sm" c="dimmed">
                {notice.context}
              </Text>
            )}
          </Stack>
          {/* A refused request shows beside the button that sent it. */}
          {error && <FormError title="From the table">{error}</FormError>}
          {notice.action}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** The game menu's hold-to-leave item names what leaving costs: the game, a roster place, or a seat left open. */
function leavingLabel(table: TableProjection): string {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  switch (true) {
    case controls.seats.length === 1:
      return 'Hold to leave and discard the game';
    case table.snapshot.stage === 'drafting':
      return 'Hold to give up your place';
    default:
      return 'Hold to give up your seat';
  }
}

/** A player approves a spectator's request for this vacant seat from the seat's Info, where the seat is shown. */
export function VacantSeatRequests({
  client,
  table,
  seat,
}: Readonly<{ client: TableSession; table: TableProjection; seat: string }>) {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  if (table.viewer.viewerSeat === SPECTATOR_SEAT || table.playback || !openSeats(table).includes(seat)) {
    return null;
  }
  const requests = controls.seatRequests.filter((request) => request.seat === seat);
  return requests.length ? (
    <Stack gap="xs" component="section" aria-label="Seat requests">
      {requests.map((request) => (
        <Group key={request.id} gap="sm" justify="space-between" wrap="nowrap">
          <Text size="sm">
            <strong>{request.requesterName}</strong> asks for {seatWords(table, seat)}.
          </Text>
          {/* Keyed by the request, so a press that began on one request never approves the next. */}
          <SeatButton
            key={request.id}
            client={client}
            table={table}
            action={{ kind: 'seat-approve', requestId: request.id }}
            color="green"
          >
            Approve
          </SeatButton>
        </Group>
      ))}
    </Stack>
  ) : null;
}

/** The vacant seats a spectator is asking for, so the player rail can mark them. */
export function requestedSeats(table: TableProjection): ReadonlySet<string> {
  const controls = table.snapshot.controls ?? emptyPublicControls();
  const open = openSeats(table);
  return new Set(
    controls.seatRequests.flatMap((request) =>
      request.seat !== null && open.includes(request.seat) ? [request.seat] : []
    )
  );
}

/* This viewer's table brightness; it stays in this browser and never reaches the game. */
function TableLightingSlider() {
  const lighting = useTableLighting();
  const labelId = useId();
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <Stack role="group" aria-labelledby={labelId} gap={4} px="sm" py="xs" miw={200}>
      <Text id={labelId} size="sm">
        Table lighting
      </Text>
      <Slider
        thumbLabel="Table lighting"
        thumbValueText={percent}
        min={TABLE_LIGHTING_MIN}
        max={TABLE_LIGHTING_MAX}
        step={0.05}
        value={lighting}
        onChange={setTableLighting}
        label={percent}
      />
    </Stack>
  );
}

/* Pins the stack counts or piece names on; holding the key shows them for a moment. */
function TableLabelItems() {
  const labels = useTableLabels();
  if (!labels) {
    return null;
  }
  return (
    <>
      <Menu.Divider />
      {TABLE_LABEL_OPTIONS.map((option) => (
        <Menu.CheckboxItem
          key={option.id}
          checked={labels.pinned[option.id]}
          onChange={() => labels.toggle(option.id)}
          rightSection={
            <Text size="xs" c="dimmed">
              hold {option.key}
            </Text>
          }
        >
          {option.name}
        </Menu.CheckboxItem>
      ))}
    </>
  );
}

/**
 * The settings menu behind the gear at the right end of the header, in every stage, after the phase controls.
 * It gives up the viewer's seat with a five-second hold, never a modal or a bar;
 * a spectator has no seat to give up.
 * While a result's confetti is on the table it also stops and clears it, for this viewer alone.
 */
export function GameMenu({
  client,
  table,
  onClearConfetti,
  sharing,
}: Readonly<{ client: TableSession; table: TableProjection; onClearConfetti?: () => void; sharing: ReactNode }>) {
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
          emphasis="quiet"
          intent="neutral"
          size="lg"
          icon={<Settings size={20} aria-hidden />}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {sharing}
        <Menu.Divider />
        <TableLightingSlider />
        <TableLabelItems />
        <Menu.Divider />
        <Menu.Item component={Link} to="/play">
          Back to the lobby
        </Menu.Item>
        {onClearConfetti && <Menu.Item onClick={onClearConfetti}>Clear confetti</Menu.Item>}
        {/* Leaving is for good, so it is held rather than asked twice; a spectator has no seat to give up. */}
        <ConfirmDeleteMenuItem
          label={seated ? leavingLabel(table) : 'Give up your seat'}
          holdingVerb="Leaving"
          disabled={!seated || table.seatCommandPending || table.reconnecting}
          onConfirm={() => client.command({ kind: 'seat-depart' })}
        />
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Playback of a stage before play, whose frame has no Phase tab to hold the playback controls: the header steps through the checkpoints and returns to the live table, in place of the stage's Ready.
 */
export function StagePlayback({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const { playback, historyPending } = table;
  const stage = table.snapshot.stage;
  if (!playback || !stage || stage === 'play' || stage === 'finished') {
    return null;
  }
  return (
    <Group gap="xs" wrap="nowrap" role="group" aria-label="Phase playback">
      <Text size="sm" c="dimmed" role="status">
        Checkpoint {playback.step} of {playback.lastStep}
      </Text>
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
      <Button onClick={client.resumeLive}>Return to live</Button>
    </Group>
  );
}
