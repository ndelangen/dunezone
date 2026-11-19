import { Group, Stack, Switch, Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { BiddingState } from '@shared/play/bidding';
import { Kbd } from '@ui/content/Kbd';
import { Stepper } from '@ui/control/Stepper';
import { TooltipTarget } from '@ui/control/TooltipTarget';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { SHORTCUTS } from '../compass/shortcuts';
import styles from './Bidder.module.css';

/*
 * Prototypes of a more fluent bidder (#2983), each a story under Play/Bidding until Norbert picks one.
 * `today` is the bidder as it plays now: + raises one spice, and Pass hands the bidder on.
 */
export type BidderVariant = 'today' | 'amount' | 'quick' | 'passCard' | 'limit' | 'all';

let shownVariant: BidderVariant = 'today';
const listeners = new Set<() => void>();

/** Picks the prototype the bidder shows; the stories set it, the live table keeps `today`. */
export function showBidderVariant(variant: BidderVariant) {
  shownVariant = variant;
  for (const listener of listeners) {
    listener();
  }
}

export function useBidderVariant(): BidderVariant {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => shownVariant
  );
}

type Props = Readonly<{
  client: TableSession;
  table: TableProjection;
  bidding: BiddingState;
  /** Whether the bidder points at the viewer, so their bid counts now. */
  mine: boolean;
  variant: Exclude<BidderVariant, 'today'>;
}>;

/** Bids `amount` and hands the bidder on in one go: the bid and the pass the old bidder took two clicks for. */
function bidAndHandOn(client: TableSession, round: number, amount: number) {
  void client.command({ kind: 'bid-raise', round, to: amount });
  void client.command({ kind: 'bid-pass', round });
}

/** A pill in the bidder's turn row, with the key that does the same when there is one. */
function Pill({
  label,
  hint,
  shortcut,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={hint}>
      <TooltipTarget>
        <UnstyledButton
          className={styles.turnButton}
          data-compact={shortcut ? undefined : true}
          aria-label={hint}
          aria-keyshortcuts={shortcut}
          disabled={disabled}
          onClick={(event) => {
            event.currentTarget.blur();
            onClick();
          }}
        >
          <span className={styles.turnSign}>{label}</span>
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </UnstyledButton>
      </TooltipTarget>
    </Tooltip>
  );
}

/* Keys over the table that a field or an open menu should keep for itself. */
function typing(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    Boolean(target?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]'))
  );
}

/**
 * The amount the viewer means to bid, never below the lowest bid that beats the table's: ↑ and ↓ (or the wheel) set it, Enter bids it and hands on.
 */
function AmountBid({ client, bidding, mine }: Omit<Props, 'variant' | 'table'>) {
  const lowest = (bidding.bid?.amount ?? 0) + 1;
  const [wanted, setWanted] = useState(lowest);
  const amount = Math.max(wanted, lowest);
  const { round } = bidding;
  useEffect(() => {
    if (!mine) {
      return;
    }
    const keydown = (event: KeyboardEvent) => {
      if (typing(event)) {
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        setWanted(Math.max(lowest, amount + (event.key === 'ArrowUp' ? 1 : -1)));
      } else if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault();
        bidAndHandOn(client, round, amount);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [client, mine, lowest, amount, round]);
  return (
    <Group gap={6} wrap="nowrap">
      <Stepper label="Bid amount" size="sm" value={amount} min={lowest} disabled={!mine} onChange={setWanted} />
      <Pill
        label={`Bid ${amount}`}
        hint={`Bid ${amount} and hand the bidder on`}
        shortcut="↵"
        disabled={!mine}
        onClick={() => bidAndHandOn(client, bidding.round, amount)}
      />
    </Group>
  );
}

const QUICK_RAISES = [1, 2, 5] as const;

/** One click raises by 1, 2 or 5 over the table's bid and hands the bidder on. */
function QuickRaises({ client, bidding, mine }: Omit<Props, 'variant' | 'table'>) {
  const base = bidding.bid?.amount ?? 0;
  return (
    <>
      {QUICK_RAISES.map((step) => (
        <Pill
          key={step}
          label={`+${step}`}
          hint={`Bid ${base + step} and hand the bidder on`}
          disabled={!mine}
          onClick={() => bidAndHandOn(client, bidding.round, base + step)}
        />
      ))}
    </>
  );
}

function PassButton({ client, bidding, mine }: Omit<Props, 'variant' | 'table'>) {
  return (
    <Pill
      label="Pass"
      hint="Pass this card"
      shortcut={SHORTCUTS.pass}
      disabled={!mine}
      onClick={() => void client.command({ kind: 'bid-pass', round: bidding.round })}
    />
  );
}

/* How long an automatic bid or pass waits once the bidder reaches the viewer, so the table sees it happen. */
const AUTO_DELAY_MS = 600;

/**
 * Bids or passes for the viewer when the bidder reaches them.
 * "Pass this card" passes every time this round, and a limit raises one over the table's bid until the bid reaches it, then passes.
 * Both reset with each new card, so one card's choice never carries into the next.
 */
function useAutoBid(
  client: TableSession,
  bidding: BiddingState,
  mine: boolean,
  settings: { passCard: boolean; limit: number }
) {
  const acted = useRef<string | null>(null);
  const { round, bid } = bidding;
  const key = `${round}:${bid?.factionId ?? ''}:${bid?.amount ?? 0}`;
  useEffect(() => {
    if (!mine || acted.current === key || (!settings.passCard && settings.limit === 0)) {
      return;
    }
    const timer = window.setTimeout(() => {
      acted.current = key;
      const amount = bid?.amount ?? 0;
      if (settings.passCard || amount >= settings.limit) {
        void client.command({ kind: 'bid-pass', round });
      } else {
        bidAndHandOn(client, round, amount + 1);
      }
    }, AUTO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [client, key, mine, round, bid, settings.passCard, settings.limit]);
}

/** The prototype bidder's own row of controls, under the disc, for a seated player. */
export function BidControls({ client, table, bidding, mine, variant }: Props) {
  const [card, setCard] = useState({ round: bidding.round, passCard: false, limit: 0 });
  /* Each new card starts with no automatic choice. */
  const settings = card.round === bidding.round ? card : { round: bidding.round, passCard: false, limit: 0 };
  const showPassCard = variant === 'passCard' || variant === 'all';
  const showLimit = variant === 'limit' || variant === 'all';
  useAutoBid(client, bidding, mine && table.canInteract, settings);
  const turn = { client, bidding, mine };
  const automatic = settings.passCard || settings.limit > 0;
  return (
    <Stack gap={4} align="center">
      {(variant === 'amount' || variant === 'quick' || variant === 'all') && (
        <Group gap={6} justify="center" wrap="nowrap" role="group" aria-label="Your bid" className={styles.turnButtons}>
          {variant !== 'quick' && <AmountBid {...turn} />}
          {variant !== 'amount' && <QuickRaises {...turn} />}
          <PassButton {...turn} />
        </Group>
      )}
      {(showPassCard || showLimit) && (
        <Group gap={10} justify="center" wrap="nowrap" className={styles.autoRow}>
          {showPassCard && (
            <Switch
              size="xs"
              label="Pass this card"
              checked={settings.passCard}
              onChange={(event) => setCard({ ...settings, passCard: event.currentTarget.checked })}
            />
          )}
          {showLimit && (
            <Group gap={6} wrap="nowrap">
              <Text size="xs" fw={700}>
                Bid up to
              </Text>
              <Stepper
                label="Bid up to"
                size="sm"
                value={settings.limit}
                min={0}
                format={(value) => (value === 0 ? 'Off' : String(value))}
                onChange={(limit) => setCard({ ...settings, limit })}
              />
            </Group>
          )}
        </Group>
      )}
      {automatic && (
        <Text size="xs" fw={700} className={styles.timer}>
          {settings.passCard ? 'Passing for you this card' : `Bidding for you up to ${settings.limit}, then passing`}
        </Text>
      )}
    </Stack>
  );
}
