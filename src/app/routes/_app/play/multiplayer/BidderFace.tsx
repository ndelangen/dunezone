import { Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { BID_COUNTDOWN_MS, BID_WARNING_MS } from '@shared/play/bidding';
import type { BiddingState } from '@shared/play/bidding';
import { Kbd } from '@ui/content/Kbd';
import { TooltipTarget } from '@ui/control/TooltipTarget';
import { useEffect, useRef } from 'react';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import type { CompassTable } from '../compass/compassTable';
import { SHORTCUTS } from '../compass/shortcuts';
import styles from './Bidder.module.css';
import { offersActions } from './tableFactions';

type Props = { client: TableSession; table: TableProjection };
type FaceProps = Props & { bidding: BiddingState };

/** The high bid: the bidder's faction symbol under the amount. */
function HighBid({ bid, table }: { bid: NonNullable<BiddingState['bid']>; table: TableProjection }) {
  const artwork = table.snapshot.factionArtwork?.[bid.factionId];
  return (
    <>
      {artwork && <FactionToken emblem={artwork.emblem} background={artwork.background} />}
      <span className={styles.amount}>{bid.amount}</span>
    </>
  );
}

function factionName(table: TableProjection, factionId: string | null) {
  return factionId ? (table.state.factionNames[factionId] ?? factionId) : '';
}

/**
 * One button per faction in storm order: players choose who opens the next round (#1007).
 * A faction whose token is face down keeps its button, greyed out, so flipping a token never moves the buttons under a pointer.
 */
function StartAt({
  client,
  table,
  order,
  eligible,
}: Props & { order: readonly string[]; eligible: readonly string[] }) {
  return (
    <Stack gap={2} align="center">
      <Text size="xs" fw={700} className={styles.timer}>
        Start new bidding starting at:
      </Text>
      <Group gap={4} justify="center" className={styles.picks} role="group" aria-label="Start new bidding starting at">
        {order.map((factionId) => {
          const artwork = table.snapshot.factionArtwork?.[factionId];
          const name = factionName(table, factionId);
          const sittingOut = !eligible.includes(factionId);
          return (
            <Tooltip key={factionId} label={sittingOut ? `${name} is sitting out: its token is face down` : name}>
              <TooltipTarget>
                <UnstyledButton
                  className={styles.pick}
                  aria-label={`Start bidding at ${name}`}
                  data-sitting-out={sittingOut || undefined}
                  disabled={!table.canInteract || !table.snapshot.bank || sittingOut}
                  onClick={() => client.command({ kind: 'bid-start', factionId })}
                >
                  {artwork ? (
                    <FactionToken emblem={artwork.emblem} background={artwork.background} />
                  ) : (
                    name.slice(0, 2)
                  )}
                </UnstyledButton>
              </TooltipTarget>
            </Tooltip>
          );
        })}
      </Group>
    </Stack>
  );
}

/** Between rounds: how the last one went, and a button per bidding faction to start the next one there. */
export function RoundResult({
  bidding,
  table,
  client,
  order,
  eligible,
}: FaceProps & { order: readonly string[]; eligible: readonly string[] }) {
  const bid = bidding.stage === 'won' ? bidding.bid : null;
  const outcome = bid ? `${factionName(table, bid.factionId)} wins with ${bid.amount}` : 'No bids';
  return (
    <Stack gap={4} align="center" className={styles.face}>
      {bid ? (
        <div className={styles.disc} data-bidder-result="won">
          <HighBid bid={bid} table={table} />
        </div>
      ) : null}
      {bidding.stage === 'idle' ? null : (
        <Text size="xs" fw={700} className={styles.timer}>
          {outcome}
        </Text>
      )}
      {/* Starting a round is a seated player's; an observer is shown no buttons for it, not even greyed. */}
      {offersActions(table) ? (
        <StartAt client={client} table={table} order={order} eligible={eligible} />
      ) : (
        bidding.stage === 'idle' && (
          <Text size="xs" fw={700} className={styles.timer}>
            Waiting for a round to start
          </Text>
        )
      )}
    </Stack>
  );
}

function raiseLabel(bid: BiddingState['bid']) {
  return bid ? `Raise the bid to ${bid.amount + 1}` : 'Bid 1';
}

function turnLabel(mine: boolean, bid: BiddingState['bid'], turnName: string) {
  if (!mine) {
    return `Waiting for ${turnName}`;
  }
  return `${raiseLabel(bid)}. Right click to pass.`;
}

/** The table supplies the deadline; these animations only draw its elapsed time. */
function ClockRing({ deadline, table, now }: { deadline: number | null; table: TableProjection; now: number }) {
  const arc = useRef<SVGCircleElement>(null);
  const warning = useRef<SVGCircleElement>(null);
  const resynchronize = useRef<(() => void) | null>(null);
  const serverNow = table.serverNow;
  const playback = Boolean(table.playback);
  useEffect(() => {
    if (deadline === null || !arc.current || !warning.current) {
      return;
    }
    const countdown = arc.current.animate([{ strokeDashoffset: '0' }, { strokeDashoffset: '100' }], {
      duration: BID_COUNTDOWN_MS,
      easing: 'linear',
      fill: 'both',
    });
    const flashes = warning.current.animate(
      [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0, offset: 0.75 }, { opacity: 0 }],
      { duration: BID_WARNING_MS / 5, iterations: 5, delay: BID_COUNTDOWN_MS, fill: 'both' }
    );
    function synchronize() {
      const elapsed = Math.max(0, serverNow() - (deadline! - BID_COUNTDOWN_MS - BID_WARNING_MS));
      countdown.currentTime = elapsed;
      flashes.currentTime = elapsed;
      if (playback) {
        countdown.pause();
        flashes.pause();
      }
    }
    resynchronize.current = synchronize;
    synchronize();
    /* A background tab returns to the shared deadline, never a fresh animation. */
    document.addEventListener('visibilitychange', synchronize);
    return () => {
      resynchronize.current = null;
      countdown.cancel();
      flashes.cancel();
      document.removeEventListener('visibilitychange', synchronize);
    };
  }, [deadline, serverNow, playback]);
  useEffect(() => {
    resynchronize.current?.();
  }, [now]);
  return (
    <svg className={styles.clockRing} viewBox="0 0 104 104" aria-hidden="true">
      <circle className={styles.clockTrack} cx="52" cy="52" r="49" />
      <circle ref={arc} className={styles.clockArc} cx="52" cy="52" r="49" pathLength="100" />
      <circle ref={warning} className={styles.clockWarning} cx="52" cy="52" r="49" />
    </svg>
  );
}

/** One of the bidder's turn buttons: its sign and the key that does the same over the table. */
function TurnButton({
  sign,
  name,
  hint,
  shortcut,
  disabledReason,
  onClick,
}: {
  sign: string;
  name: string;
  hint: string;
  shortcut: string;
  disabledReason?: string;
  onClick: (() => void) | undefined;
}) {
  return (
    <Tooltip label={disabledReason ?? hint}>
      <TooltipTarget>
        <UnstyledButton
          className={styles.turnButton}
          aria-label={name}
          aria-keyshortcuts={shortcut}
          disabled={disabledReason !== undefined}
          onClick={(event) => {
            /* A clicked button gives its focus back, so Space for the compass never presses it again. */
            event.currentTarget.blur();
            onClick?.();
          }}
        >
          <span className={styles.turnSign}>{sign}</span>
          <Kbd>{shortcut}</Kbd>
        </UnstyledButton>
      </TooltipTarget>
    </Tooltip>
  );
}

/** The bidder's commands for the viewer while it points at them, the same ones the I, O and P keys run; null otherwise. */
export type TurnCommands = CompassTable['bidding'];

/**
 * The raise, the lowering and the pass of the faction the bidder points at, each with its keyboard shortcut.
 * A seated player keeps the row's room while the bidder points elsewhere, so the disc never moves under a pointer when the turn arrives.
 */
function TurnButtons({ commands, bid }: { commands: TurnCommands; bid: BiddingState['bid'] }) {
  return (
    <Group
      gap={6}
      justify="center"
      wrap="nowrap"
      role="group"
      aria-label="Your bid"
      aria-hidden={commands ? undefined : true}
      inert={!commands}
      data-waiting={commands ? undefined : true}
      className={styles.turnButtons}
    >
      <TurnButton sign="+" name="Raise" hint={raiseLabel(bid)} shortcut={SHORTCUTS.raise} onClick={commands?.raise} />
      <TurnButton
        sign="−"
        name="Lower"
        hint="Take back your last raise"
        shortcut={SHORTCUTS.lower}
        disabledReason={commands?.lower ? undefined : 'Only a raise you made this turn can be taken back'}
        onClick={commands?.lower ?? undefined}
      />
      <TurnButton
        sign="Pass"
        name="Pass"
        hint="Hand the bidder on"
        shortcut={SHORTCUTS.pass}
        onClick={commands?.pass}
      />
    </Group>
  );
}

/** A round in progress: the faction the bidder points at raises with a click and passes with a right click. */
export function OpenRound({
  bidding,
  table,
  client,
  remaining,
  warningRemaining,
  now,
  commands,
}: FaceProps & {
  commands: TurnCommands;
  remaining: number | null;
  warningRemaining: number | null;
  now: number;
}) {
  const { bid, round, turn } = bidding;
  const mine = table.canInteract && turn !== null && table.snapshot.bank?.factionId === turn;
  const turnName = factionName(table, turn);
  const label = turnLabel(mine, bid, turnName);
  const showClock = bidding.timed && (!table.playback || table.playback.recordedAt !== undefined);
  const face = bid ? (
    <HighBid bid={bid} table={table} />
  ) : (
    <span className={styles.prompt}>{mine ? 'Bid' : 'No bid'}</span>
  );
  return (
    <Stack gap={2} align="center" className={styles.face}>
      <div className={showClock ? styles.clockWrap : undefined}>
        {showClock && <ClockRing deadline={bidding.deadline} table={table} now={now} />}
        <Tooltip label={label}>
          {/* The right-click passes on the target, so it never reaches the table even while the disc is disabled. */}
          <TooltipTarget
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (mine) {
                void client.command({ kind: 'bid-pass', round });
              }
            }}
          >
            {/* An observer is shown the bid as it stands, not a disc to press. */}
            {offersActions(table) ? (
              <UnstyledButton
                className={styles.disc}
                data-bidder-turn={turn ?? undefined}
                data-mine={mine || undefined}
                aria-label={label}
                disabled={!mine}
                onClick={() => client.command({ kind: 'bid-raise', round })}
              >
                {face}
              </UnstyledButton>
            ) : (
              <div className={styles.disc} data-bidder-turn={turn ?? undefined} role="img" aria-label={label}>
                {face}
              </div>
            )}
          </TooltipTarget>
        </Tooltip>
      </div>
      {!showClock ? null : (
        <Text component="output" role="timer" size="xs" fw={700} className={styles.timer}>
          {remaining === null
            ? 'Bid or pass starts clock'
            : warningRemaining === null
              ? `${remaining}s`
              : `Passing in ${warningRemaining}s`}{' '}
          · {turnName}
        </Text>
      )}
      {offersActions(table) && <TurnButtons commands={commands} bid={bid} />}
    </Stack>
  );
}
