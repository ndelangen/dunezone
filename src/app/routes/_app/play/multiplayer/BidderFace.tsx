import { Group, Stack, Text, UnstyledButton } from '@mantine/core';
import type { BiddingState } from '@shared/play/bidding';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import styles from './Bidder.module.css';

type Props = { client: TableSession; table: TableProjection };
type FaceProps = Props & { bidding: BiddingState };

/** The high bid: the bidder's faction symbol under the amount. */
function HighBid({ bid, table }: { bid: NonNullable<BiddingState['bid']>; table: TableProjection }) {
  const artwork = table.snapshot.factionArtwork?.[bid.factionId];
  return (
    <>
      {artwork && <FactionToken logo={artwork.logo} background={artwork.background} />}
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
            <UnstyledButton
              key={factionId}
              className={styles.pick}
              aria-label={`Start bidding at ${name}`}
              title={sittingOut ? `${name} is sitting out: its token is face down` : name}
              data-sitting-out={sittingOut || undefined}
              disabled={!table.canInteract || sittingOut}
              onClick={() => client.command({ kind: 'bid-start', factionId })}
            >
              {artwork ? <FactionToken logo={artwork.logo} background={artwork.background} /> : name.slice(0, 2)}
            </UnstyledButton>
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
      <StartAt client={client} table={table} order={order} eligible={eligible} />
    </Stack>
  );
}

function turnLabel(mine: boolean, bid: BiddingState['bid'], turnName: string) {
  if (!mine) {
    return `Waiting for ${turnName}`;
  }
  return `${bid ? `Raise the bid to ${bid.amount + 1}` : 'Bid 1'}. Right click to pass.`;
}

/** A round in progress: the faction the bidder points at raises with a click and passes with a right click. */
export function OpenRound({ bidding, table, client, remaining }: FaceProps & { remaining: number | null }) {
  const { bid, round, turn } = bidding;
  const mine = table.canInteract && turn !== null && table.snapshot.bank?.factionId === turn;
  const turnName = factionName(table, turn);
  const label = turnLabel(mine, bid, turnName);
  return (
    <Stack gap={2} align="center" className={styles.face}>
      <UnstyledButton
        className={styles.disc}
        data-bidder-turn={turn ?? undefined}
        data-mine={mine || undefined}
        aria-label={label}
        title={label}
        disabled={!mine}
        onClick={() => client.command({ kind: 'bid-raise', round })}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (mine) {
            void client.command({ kind: 'bid-pass', round });
          }
        }}
      >
        {bid ? <HighBid bid={bid} table={table} /> : <span className={styles.prompt}>{mine ? 'Bid' : 'No bid'}</span>}
      </UnstyledButton>
      {remaining === null ? null : (
        <Text component="output" role="timer" size="xs" fw={700} className={styles.timer}>
          {remaining}s · {turnName}
        </Text>
      )}
    </Stack>
  );
}
