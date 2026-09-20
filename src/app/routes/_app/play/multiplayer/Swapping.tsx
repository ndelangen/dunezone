import { Avatar, Button, Group, Image, Stack, Text } from '@mantine/core';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { SwapAction, SwappingState } from '@shared/play/swapping';
import { Section } from '@ui/block/Section';
import { useEffect, useState } from 'react';

import type { TableProjection, TableSession } from './TableSession';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;
type RosterSeat = NonNullable<TableProjection['snapshot']['roster']>['seats'][number];
type Player = NonNullable<TableProjection['snapshot']['controls']>['players'][number];
type Trading = Readonly<{
  state: SwappingState;
  seat: string;
  closed: boolean;
  disabled: boolean;
  send: (action: SwapAction) => unknown;
}>;

function tradingStatus(state: SwappingState, closed: boolean, players: number, vacancies: number) {
  if (!closed) {
    return `${state.ready.length} of ${players} players ready. Trading ends after four minutes.`;
  }
  return vacancies ? 'Trading ended. Waiting for approved replacements.' : 'Trading ended. Your assignments are fixed.';
}

export function SwappingPanel({ client, table }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const { swapping: state, roster } = table.snapshot;
  if (!state || !roster) {
    return null;
  }
  const seat = table.viewer.viewerSeat;
  const remaining = Math.max(0, Math.ceil((state.deadline - now) / 1000));
  const closed = state.closed || remaining === 0;
  const trading: Trading = {
    state,
    seat,
    closed,
    disabled: !table.canInteract || table.seatCommandPending || closed,
    send: (action) => client.command(action),
  };
  const players = table.snapshot.controls?.players ?? [];
  const mine = roster.seats.find((entry) => entry.id === seat);
  return (
    <Stack gap="md">
      {mine && <Readiness trading={trading} mine={mine} remaining={remaining} />}
      <Stack component="ol" aria-label="Seats and players" gap="sm" m={0} p={0} style={{ listStyle: 'none' }}>
        {roster.seats.map((entry) => (
          <SeatRow
            key={entry.id}
            entry={entry}
            player={players.find((candidate) => candidate.seat === entry.id)}
            trading={trading}
          />
        ))}
      </Stack>
      <Text size="sm" role="status">
        {tradingStatus(state, closed, players.length, roster.seats.length - players.length)}
      </Text>
    </Stack>
  );
}

function Readiness({ trading, mine, remaining }: Readonly<{ trading: Trading; mine: RosterSeat; remaining: number }>) {
  const { state, seat, disabled, send } = trading;
  const ready = state.ready.includes(seat);
  return (
    <Section helpOnly title={mine.faction?.name ?? mine.id} description="Offer a trade, or ready up to keep your seat.">
      <Group justify="space-between">
        <Group>
          <Text component="output" aria-label="Trading time remaining">
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </Text>
          <Button
            disabled={disabled}
            aria-pressed={ready}
            variant={ready ? 'default' : 'filled'}
            onClick={() => send({ kind: 'swap-ready', round: state.round, seat, ready: !ready })}
          >
            {ready ? 'Withdraw readiness' : 'Ready to start'}
          </Button>
        </Group>
      </Group>
    </Section>
  );
}

function tradeChoice(state: SwappingState, seat: string, entry: RosterSeat, player: Player | undefined) {
  const expected = { round: state.round, seat };
  const incoming = state.offers.find((offer) => offer.target === seat && offer.origin === entry.id);
  if (incoming) {
    return {
      label: 'Accept trade',
      prefix: 'Accept trade from',
      action: { kind: 'swap-accept', ...expected, offerId: incoming.id } as const,
      variant: 'filled',
    };
  }
  const outgoing = state.offers.find((offer) => offer.origin === seat && offer.target === entry.id);
  if (outgoing) {
    return {
      label: 'Cancel offer',
      prefix: 'Cancel offer to',
      action: { kind: 'swap-cancel', ...expected, offerId: outgoing.id } as const,
      variant: 'default',
    };
  }
  return {
    label: player ? 'Offer trade' : 'Move here',
    prefix: player ? 'Offer trade to' : 'Move to',
    action: { kind: 'swap-offer', ...expected, target: entry.id } as const,
    variant: 'default',
  };
}

function SeatAction({
  trading,
  entry,
  player,
}: Readonly<{ trading: Trading; entry: RosterSeat; player: Player | undefined }>) {
  const { state, seat, closed, disabled, send } = trading;
  if (seat === entry.id) {
    return (
      <Text size="sm" c="dimmed">
        Your seat
      </Text>
    );
  }
  if (seat === SPECTATOR_SEAT || closed) {
    return null;
  }
  const choice = tradeChoice(state, seat, entry, player);
  const ready = state.ready.includes(seat) || state.ready.includes(entry.id);
  return (
    <Button
      size="xs"
      variant={choice.variant}
      disabled={disabled || ready}
      aria-label={`${choice.prefix} ${entry.faction?.name ?? entry.id}`}
      onClick={() => send(choice.action)}
    >
      {choice.label}
    </Button>
  );
}

function SeatRow({
  trading,
  entry,
  player,
}: Readonly<{ trading: Trading; entry: RosterSeat; player: Player | undefined }>) {
  const { state } = trading;
  return (
    <Group component="li" justify="space-between" wrap="wrap">
      <Group>
        <Text size="sm">{entry.position + 1}</Text>
        {entry.faction && <Image src={state.tokens[entry.id]} alt="" w={34} h={34} radius="50%" />}
        <Text>{entry.faction?.name ?? entry.id}</Text>
      </Group>
      <Group>
        {player && <Avatar src={player.avatar} name={player.name} size="sm" />}
        <Text size="sm">
          {player?.name ?? 'Open seat'}
          {state.ready.includes(entry.id) ? ' · Ready' : ''}
        </Text>
        <SeatAction trading={trading} entry={entry} player={player} />
      </Group>
    </Group>
  );
}
