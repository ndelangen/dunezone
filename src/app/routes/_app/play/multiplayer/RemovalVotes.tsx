import { Button, Group, Stack, Text, VisuallyHidden } from '@mantine/core';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { factionTokenOf } from '@shared/play/factionToken';
import type { PublicControls } from '@shared/play/inventory';
import type { RemovalVote } from '@shared/play/removal';
import { rosterSeat } from '@shared/play/schema';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ExternalLink } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';

import { useFactionPageSlug } from '@db/factions';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import type { CompassPlayer } from '../compass/compassTable';
import { allianceHue, PlayerAlliance } from './Alliances';
import { Conversation } from './Conversation';
import { FactionDetails } from './FactionDetails';
import { requestedSeats, VacantSeatRequests } from './SeatRequests';
import { SwappingSeat } from './Swapping';
import { isSpectator, seatFaction } from './tableFactions';
import { useServerNow } from './useServerNow';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/* How each ballot reads: a Remove against, a Keep for, or not cast yet. */
const BALLOT_BADGES = {
  remove: { tone: 'negative', label: 'Remove' },
  keep: { tone: 'positive', label: 'Keep' },
  uncast: { tone: 'neutral', label: 'Uncast' },
} as const;

function Ballots({ ballots }: Readonly<{ ballots: RemovalVote['ballots'] }>) {
  return (
    <Stack gap={4}>
      {ballots.map((ballot, index) => (
        <Group key={`${ballot.seat}-${index}`} justify="space-between" gap="sm">
          <Text size="sm">{ballot.name}</Text>
          <StatusBadge tone={BALLOT_BADGES[ballot.choice ?? 'uncast'].tone}>
            {BALLOT_BADGES[ballot.choice ?? 'uncast'].label}
          </StatusBadge>
        </Group>
      ))}
    </Stack>
  );
}

function OpenVote({ client, table, vote }: Props & Readonly<{ vote: RemovalVote }>) {
  const now = useServerNow();
  const approvals = vote.ballots.filter((ballot) => ballot.choice === 'remove').length;
  const against = vote.ballots.filter((ballot) => ballot.choice === 'keep').length;
  const own = vote.ballots.find((ballot) => ballot.seat === table.viewer.viewerSeat);
  const canVote = table.canInteract && own !== undefined;
  const elapsed = Math.max(0, Math.floor((now - vote.openedAt) / 1000));
  return (
    <Section hiddenHeading title={`Remove ${vote.target.name}?`}>
      <Stack gap="sm">
        <Text size="sm">
          {Math.max(0, vote.threshold - approvals)} more Remove or{' '}
          {Math.max(0, vote.ballots.length - vote.threshold + 1 - against)} more Keep to decide. Open{' '}
          {Math.floor(elapsed / 60)}m {elapsed % 60}s.
        </Text>
        <Ballots ballots={vote.ballots} />
        {canVote ? (
          <Group gap="sm">
            <Button
              aria-pressed={own.choice === 'remove'}
              variant={own.choice === 'remove' ? 'filled' : 'light'}
              onClick={() => client.command({ kind: 'removal-ballot', voteId: vote.id, choice: 'remove' })}
            >
              Remove
            </Button>
            <Button
              aria-pressed={own.choice === 'keep'}
              variant={own.choice === 'keep' ? 'filled' : 'light'}
              onClick={() => client.command({ kind: 'removal-ballot', voteId: vote.id, choice: 'keep' })}
            >
              Keep
            </Button>
            <Button
              variant="subtle"
              disabled={own.choice === null}
              onClick={() => client.command({ kind: 'removal-ballot', voteId: vote.id, choice: null })}
            >
              Withdraw
            </Button>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            {table.viewer.viewerSeat === vote.target.seat
              ? 'You cannot vote on your own removal.'
              : 'Only eligible players can vote.'}
          </Text>
        )}
      </Stack>
    </Section>
  );
}

type Player = PublicControls['players'][number];

/* Every seat's player, a vacant seat by its faction; the viewer's own seat comes last. */
function seatPlayers(table: TableProjection): Player[] {
  const occupants = table.snapshot.controls?.players ?? [];
  return (
    table.snapshot.roster?.seats.map(
      (seat) =>
        occupants.find((player) => player.seat === seat.id) ?? {
          seat: seat.id,
          /* A vacant seat's line under the name already gives the seat, which tells a shared faction name apart. */
          name: seat.faction?.name ?? seat.id,
          avatar: null,
          slug: null,
        }
    ) ?? occupants
  )
    .slice()
    .sort((a, b) => Number(a.seat === table.viewer.viewerSeat) - Number(b.seat === table.viewer.viewerSeat));
}

/* Another seated player, under no vote yet, can be put to one by a seated viewer. */
function removable(table: TableProjection, seat: string, hasVote: boolean) {
  return (
    table.snapshot.controls?.players.some((entry) => entry.seat === seat) &&
    !hasVote &&
    table.viewer.viewerSeat !== seat &&
    !isSpectator(table)
  );
}

/* A faction's page and its details, read from the table once the connection is authorized. */
function useFactionDetails(client: TableSession, factionId: string | undefined) {
  const { status, factions } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => {
    if (factionId && status === 'authorized') {
      client.readFaction(factionId);
    }
  }, [client, factionId, status]);
  const slug = useFactionPageSlug(factionId ?? '');
  return { slug, details: factionId ? factions[factionId] : undefined };
}

function PlayerInformation({ client, table, player, hasVote }: Props & Readonly<{ player: Player; hasVote: boolean }>) {
  const faction = rosterSeat(table.snapshot.roster, player.seat)?.faction;
  const count = table.snapshot.controls?.players.length ?? 0;
  const canStart = removable(table, player.seat, hasVote);
  const { slug, details } = useFactionDetails(client, faction?.id);
  return (
    <Section hiddenHeading title={player.name}>
      <Stack gap="md">
        {(slug || canStart) && (
          <Group gap="sm">
            {slug && faction && <FactionPageButton slug={slug} name={faction.name} />}
            {canStart && (
              <Button
                color="red"
                disabled={!table.canInteract || count < 3}
                onClick={() => client.command({ kind: 'removal-start', seat: player.seat })}
              >
                Start removal vote
              </Button>
            )}
          </Group>
        )}
        {canStart && count < 3 && (
          <Text size="sm" c="dimmed">
            Removal requires at least three players.
          </Text>
        )}
        <Text size="sm">
          {faction?.name ?? 'No faction assigned'} · {player.seat.replace('seat-', 'Seat ')}
        </Text>
        <SwappingSeat client={client} table={table} seat={player.seat} />
        <PlayerAlliance client={client} table={table} seat={player.seat} />
        {details && <FactionDetails faction={details} />}
      </Stack>
    </Section>
  );
}

/* A seat's faction page in a new tab, so the table stays open: what a faction starts with is public; what it holds now is not (#1007). */
function FactionPageButton({ slug, name }: Readonly<{ slug: string; name: string }>) {
  return (
    <Button
      component="a"
      href={`/factions/${encodeURIComponent(slug)}`}
      target="_blank"
      rel="noreferrer"
      variant="default"
      rightSection={<ExternalLink size={16} aria-hidden />}
    >
      View {name}
      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
    </Button>
  );
}

/* Each player as a window of their own, and what the compass's chat bar shows for them. */

/** The players as the compass shows them: a token each in the chat bar, with what waits on them. */
export function usePlayerWindows(client: TableSession, table: TableProjection) {
  const { conversations } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const votes = table.snapshot.removalVotes ?? [];
  const asked = requestedSeats(table);
  const viewerSeat = table.viewer.viewerSeat;
  const ownHue = viewerSeat ? allianceHue(table.snapshot, seatFaction(table, viewerSeat)) : undefined;
  const players: CompassPlayer[] = seatPlayers(table).map((player) => {
    const faction = rosterSeat(table.snapshot.roster, player.seat)?.faction;
    const peerId = seatFaction(table, player.seat);
    const token = faction ? factionTokenOf(table.snapshot.table.pieces, faction.id)?.items[0]?.artwork?.front : null;
    const vote = votes.find((entry) => entry.target.seat === player.seat)?.id;
    return {
      ...(vote && { vote }),
      seat: player.seat,
      name: player.name,
      factionName: faction?.name ?? null,
      token: token ?? table.snapshot.swapping?.tokens[player.seat] ?? player.avatar ?? null,
      unread: conversations.summaries.find((entry) => entry.peerId === peerId)?.unread ?? 0,
      own: player.seat === table.viewer.viewerSeat,
      canConverse: Boolean(peerId && conversations.context?.peers.some((peer) => peer.id === peerId)),
      attention: Boolean(vote) || asked.has(player.seat),
      ally: player.seat !== viewerSeat && ownHue !== undefined && allianceHue(table.snapshot, peerId) === ownHue,
    };
  });
  return {
    players,
    tableChat: conversations.context
      ? { unread: conversations.summaries.find((entry) => entry.peerId === TABLE_CONVERSATION)?.unread ?? 0 }
      : null,
  };
}

/** One player's window: their conversation, or their public information with any vote and seat request against their seat. */
export function PlayerWindow({
  client,
  table,
  seat,
  tab,
  error,
}: Props & Readonly<{ seat: string; tab: 'public' | 'conversation'; error: string | null }>) {
  const { conversations } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const player = seatPlayers(table).find((entry) => entry.seat === seat);
  if (seat === TABLE_CONVERSATION) {
    return conversations.context ? (
      <Conversation
        key={`${conversations.context.factionId}:${TABLE_CONVERSATION}`}
        client={client}
        peerId={TABLE_CONVERSATION}
      />
    ) : null;
  }
  if (!player) {
    return null;
  }
  const vote = (table.snapshot.removalVotes ?? []).find((entry) => entry.target.seat === seat);
  const peerId = seatFaction(table, seat);
  if (tab === 'conversation' && peerId && conversations.context?.peers.some((peer) => peer.id === peerId)) {
    return <Conversation key={`${conversations.context.factionId}:${peerId}`} client={client} peerId={peerId} />;
  }
  return (
    <Stack gap="lg">
      {error && <FormError title="From the table">{error}</FormError>}
      {vote && <OpenVote client={client} table={table} vote={vote} />}
      <VacantSeatRequests client={client} table={table} seat={seat} />
      <PlayerInformation client={client} table={table} player={player} hasVote={Boolean(vote)} />
    </Stack>
  );
}
