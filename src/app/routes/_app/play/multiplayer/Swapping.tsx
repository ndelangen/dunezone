import { Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { SwapAction, SwappingState } from '@shared/play/swapping';
import { IconAction } from '@ui/control/IconAction';
import { Armchair, ArrowLeftRight, Hourglass } from 'lucide-react';
import { useId } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { ReadyToggle } from './PhaseNavigation';
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
  /* A seat command the viewer sent is still on its way, which also holds trades back. */
  pending: boolean;
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

/* Seconds left in the round at the table's time in milliseconds. */
function secondsLeft(state: SwappingState, now: number) {
  return Math.max(0, Math.ceil((state.deadline - now) / 1000));
}

/* What the viewer can trade at the table's time in milliseconds. */
function tradingAt(
  table: TableProjection,
  state: SwappingState,
  now: number,
  send: (action: SwapAction) => unknown
): Trading {
  const closed = state.closed || secondsLeft(state, now) === 0;
  return {
    state,
    seat: table.viewer.viewerSeat,
    closed,
    disabled: !table.canInteract || table.seatCommandPending || closed,
    pending: table.seatCommandPending,
    send,
  };
}

/* Called only from the children that mount during swapping, so the clock ticks only while trading can run. */
function useTrading({ client, table, state }: Swapping) {
  const now = useServerNow();
  return {
    trading: tradingAt(table, state, now, (action) => client.command(action)),
    remaining: secondsLeft(state, now),
  };
}

/** The header's Ready toggle while trading: the same toggle as in play, counting the players ready to start. */
export function SwappingReady({ client, table }: Props) {
  const state = swappingState(table);
  return state && table.viewer.viewerSeat !== SPECTATOR_SEAT ? (
    <SwapReadyToggle client={client} table={table} state={state} />
  ) : null;
}

function SwapReadyToggle(props: Swapping) {
  const { trading } = useTrading(props);
  const { state, seat, disabled, send } = trading;
  const ready = state.ready.includes(seat);
  return (
    <ReadyToggle
      ready={ready}
      count={state.ready.length}
      of={props.table.snapshot.controls?.players.length ?? 0}
      disabled={disabled}
      onToggle={() => send({ kind: 'swap-ready', round: state.round, seat, ready: !ready })}
    />
  );
}

/** The phase chip's copy while trading: the stage word over the time left, or why trading ended. */
export function SwappingStatus({ client, table }: Props) {
  const state = swappingState(table);
  return state ? <TradingClock client={client} table={table} state={state} /> : null;
}

function TradingClock(props: Swapping) {
  const { table } = props;
  const { trading, remaining } = useTrading(props);
  const { state, closed } = trading;
  const players = table.snapshot.controls?.players.length ?? 0;
  const status = tradingStatus(state, closed, players, (table.snapshot.roster?.seats.length ?? 0) - players);
  const statusId = useId();
  return (
    <div className="seated-phase-status__copy">
      <span>Trading</span>
      {/* The timer is kept quiet inside the header's live region, so the countdown is not read out every second; the tooltip names nothing to assistive technology, so its status also describes the timer until the timer shows that status itself. */}
      <Tooltip label={status} multiline maw={320} events={{ hover: true, focus: true, touch: false }}>
        <Text
          component="strong"
          inherit
          role="timer"
          aria-live="off"
          tabIndex={0}
          aria-label="Trading time remaining"
          aria-describedby={closed ? undefined : statusId}
          style={{ pointerEvents: 'auto' }}
        >
          {closed ? status : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} left`}
        </Text>
      </Tooltip>
      {closed ? null : (
        <span id={statusId} hidden>
          {status}
        </span>
      )}
      {/* The timer is not live, so the end of trading is said here, once. */}
      <VisuallyHidden role="status">{closed ? status : ''}</VisuallyHidden>
    </div>
  );
}

/** The seat's trade as one icon for the Faction info toolbar: offer, accept, withdraw, or move to an open seat. */
export function SwappingSeat({ client, table, seat }: Props & { seat: string }) {
  const now = useServerNow();
  return seatTrade(table, seat, now, (action) => client.command(action));
}

/**
 * The trade action that fits the seat as the viewer stands with it, at the table's time in milliseconds, or null outside trading.
 * The viewer's own seat, an observer and a closed round get none.
 */
export function seatTrade(table: TableProjection, seat: string, now: number, send: (action: SwapAction) => unknown) {
  const state = swappingState(table);
  const entry = table.snapshot.roster?.seats.find((candidate) => candidate.id === seat);
  if (!state || !entry) {
    return null;
  }
  const trading = tradingAt(table, state, now, send);
  const player = table.snapshot.controls?.players.find((candidate) => candidate.seat === entry.id);
  const label = (entry.faction && snapshotFactionLabels(table.snapshot)[entry.faction.id]) ?? entry.id;
  return <SeatAction trading={trading} entry={entry} player={player} label={label} />;
}

const ICON = 17;

function tradeChoice(state: SwappingState, seat: string, entry: RosterSeat, player: Player | undefined, label: string) {
  const expected = { round: state.round, seat };
  const incoming = state.offers.find((offer) => offer.target === seat && offer.origin === entry.id);
  if (incoming) {
    return {
      label: `Accept trade from ${label}`,
      tooltip: 'Accept their trade offer. You swap factions and seats.',
      action: { kind: 'swap-accept', ...expected, offerId: incoming.id } as const,
      icon: <ArrowLeftRight size={ICON} />,
      intent: 'positive',
    } as const;
  }
  const outgoing = state.offers.find((offer) => offer.origin === seat && offer.target === entry.id);
  if (outgoing) {
    return {
      label: `Cancel offer to ${label}`,
      tooltip: 'Offering a trade. Click to withdraw the offer.',
      action: { kind: 'swap-cancel', ...expected, offerId: outgoing.id } as const,
      icon: <Hourglass size={ICON} />,
      pressed: true,
    } as const;
  }
  return player
    ? ({
        label: `Offer trade to ${label}`,
        tooltip: 'Offer them a trade. You swap factions and seats once they accept.',
        action: { kind: 'swap-offer', ...expected, target: entry.id } as const,
        icon: <ArrowLeftRight size={ICON} />,
      } as const)
    : ({
        label: `Move to ${label}`,
        tooltip: 'Move to this open seat and take its faction.',
        action: { kind: 'swap-offer', ...expected, target: entry.id } as const,
        icon: <Armchair size={ICON} />,
      } as const);
}

/* Why the trade cannot be sent right now, or undefined while it can. */
function blockedReason(trading: Trading, ready: Readonly<{ own: boolean; theirs: boolean }>) {
  if (trading.pending) {
    return 'Waiting for the table to answer your last trade or seat request.';
  }
  if (trading.disabled) {
    return 'Trades wait while the table reconnects.';
  }
  if (ready.own) {
    return 'You are ready. Unready in the header to trade.';
  }
  return ready.theirs ? 'They are ready, so they take no trades.' : undefined;
}

function SeatAction({
  trading,
  entry,
  player,
  label,
}: Readonly<{ trading: Trading; entry: RosterSeat; player: Player | undefined; label: string }>) {
  const { state, seat, closed, send } = trading;
  if (seat === entry.id || seat === SPECTATOR_SEAT || closed) {
    return null;
  }
  const choice = tradeChoice(state, seat, entry, player, label);
  const blocked = blockedReason(trading, { own: state.ready.includes(seat), theirs: state.ready.includes(entry.id) });
  return (
    <IconAction
      size="lg"
      emphasis="standard"
      intent={'intent' in choice ? choice.intent : 'neutral'}
      pressed={'pressed' in choice ? choice.pressed : undefined}
      label={choice.label}
      tooltip={choice.tooltip}
      icon={choice.icon}
      disabledReason={blocked}
      onClick={() => send(choice.action)}
    />
  );
}
