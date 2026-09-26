import { Button, Group, Text, Tooltip } from '@mantine/core';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { SwapAction, SwappingState } from '@shared/play/swapping';

import type { TableProjection, TableSession } from './TableSession';
import { useServerNow } from './useServerNow';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;
type Swapping = Props & Readonly<{ state: SwappingState }>;
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

function swappingState(table: TableProjection) {
  return table.snapshot.stage === 'swapping' ? table.snapshot.swapping : undefined;
}

/* Called only from the children that mount during swapping, so the clock ticks only while trading can run. */
function useTrading({ client, table, state }: Swapping) {
  const now = useServerNow();
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
  const state = swappingState(table);
  return state ? <Readiness client={client} table={table} state={state} /> : null;
}

function Readiness(props: Swapping) {
  const { table } = props;
  const { trading, remaining } = useTrading(props);
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
  const state = swappingState(table);
  const entry = table.snapshot.roster?.seats.find((candidate) => candidate.id === seat);
  return state && entry ? <Seat client={client} table={table} state={state} seat={seat} entry={entry} /> : null;
}

function Seat({ seat, entry, ...props }: Swapping & Readonly<{ seat: string; entry: RosterSeat }>) {
  const { trading } = useTrading(props);
  const player = props.table.snapshot.controls?.players.find((candidate) => candidate.seat === seat);
  return (
    <Group gap="sm">
      <Text size="sm" c="dimmed">
        {!player ? 'Open seat' : trading.state.ready.includes(seat) ? 'Ready' : 'Not ready'}
      </Text>
      <SeatAction trading={trading} entry={entry} player={player} />
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
