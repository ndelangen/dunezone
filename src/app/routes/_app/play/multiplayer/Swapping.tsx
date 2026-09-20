import { Button, Group, Text, Tooltip } from '@mantine/core';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { SwapAction, SwappingState } from '@shared/play/swapping';
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

function useTrading({ client, table }: Props) {
  const [now, setNow] = useState(Date.now);
  const swapping = table.snapshot.stage === 'swapping';
  useEffect(() => {
    if (!swapping) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [swapping]);
  const state = table.snapshot.swapping;
  if (!state || table.snapshot.stage !== 'swapping') {
    return null;
  }
  const remaining = Math.max(0, Math.ceil((state.deadline - now) / 1000));
  const closed = state.closed || remaining === 0;
  const trading: Trading = {
    state,
    seat: table.viewer.viewerSeat,
    closed,
    disabled: !table.canInteract || table.seatCommandPending || closed,
    send: (action) => client.command(action),
  };
  return { trading, remaining };
}

export function SwappingReadiness({ client, table }: Props) {
  const current = useTrading({ client, table });
  if (!current) {
    return null;
  }
  const { trading, remaining } = current;
  const { state, seat, disabled, send, closed } = trading;
  const ready = state.ready.includes(seat);
  const players = table.snapshot.controls?.players.length ?? 0;
  const status = tradingStatus(state, closed, players, (table.snapshot.roster?.seats.length ?? 0) - players);
  return (
    <Group justify="space-between" gap="sm">
      <Tooltip label={status} events={{ hover: true, focus: true, touch: true }}>
        <Text component="output" tabIndex={0} aria-label="Trading time remaining">
          {closed ? status : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
        </Text>
      </Tooltip>
      {seat !== SPECTATOR_SEAT && (
        <Button
          disabled={disabled}
          aria-pressed={ready}
          variant={ready ? 'default' : 'filled'}
          onClick={() => send({ kind: 'swap-ready', round: state.round, seat, ready: !ready })}
        >
          {ready ? 'Withdraw readiness' : 'Ready to start'}
        </Button>
      )}
    </Group>
  );
}

export function SwappingSeat({ client, table, seat }: Props & { seat: string }) {
  const current = useTrading({ client, table });
  const entry = table.snapshot.roster?.seats.find((candidate) => candidate.id === seat);
  if (!current || !entry) {
    return null;
  }
  const player = table.snapshot.controls?.players.find((candidate) => candidate.seat === seat);
  return (
    <Group gap="sm">
      <Text size="sm" c="dimmed">
        {!player ? 'Open seat' : current.trading.state.ready.includes(seat) ? 'Ready' : 'Not ready'}
      </Text>
      <SeatAction trading={current.trading} entry={entry} player={player} />
    </Group>
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
