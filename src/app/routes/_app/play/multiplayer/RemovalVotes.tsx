import { Avatar, Button, Group, Stack, Text } from '@mantine/core';
import { alliesOf } from '@shared/play/alliances';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { PublicControls } from '@shared/play/inventory';
import type { RemovalVote } from '@shared/play/removal';
import { rosterSeat } from '@shared/play/schema';
import { FormError } from '@ui/block/FormError';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { useEffect, useSyncExternalStore } from 'react';

import { useFactionPageSlug } from '@db/factions';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import type { CompassPlayer } from '../compass/compassTable';
import { seatAlliance } from './Alliances';
import { FactionDetails } from './FactionDetails';
import { FactionInfoHeader } from './FactionInfoHeader';
import type { FactionInfoHeaderModel } from './FactionInfoHeader';
import { factionToken, FactionTokenFace, factionTokenFace } from './FactionTokenFace';
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

/* What a seat shows where the table has no token for its faction: the token it holds while trading seats, else its player's avatar. */
function standInToken(table: TableProjection, player: Player) {
  return table.snapshot.swapping?.tokens[player.seat] ?? player.avatar ?? null;
}

function PlayerInformation({ client, table, player, hasVote }: Props & Readonly<{ player: Player; hasVote: boolean }>) {
  const faction = rosterSeat(table.snapshot.roster, player.seat)?.faction;
  const count = table.snapshot.controls?.players.length ?? 0;
  const { slug, details } = useFactionDetails(client, faction?.id);
  const alliance = seatAlliance(client, table, player.seat);
  const names = snapshotFactionLabels(table.snapshot);
  const model: FactionInfoHeaderModel = {
    token: faction ? (
      <FactionTokenFace token={factionToken(table, faction.id, names, standInToken(table, player))} size={44} />
    ) : (
      <Avatar src={standInToken(table, player)} size={44} radius="xl" alt="">
        {player.name.slice(0, 1)}
      </Avatar>
    ),
    name: player.name,
    faction: faction?.name ?? null,
    seat: player.seat.replace('seat-', 'Seat '),
    own: player.seat === table.viewer.viewerSeat,
    alliance,
    page: slug && faction ? { href: `/factions/${encodeURIComponent(slug)}`, name: faction.name } : null,
    removal: removable(table, player.seat, hasVote)
      ? {
          start: () => client.command({ kind: 'removal-start', seat: player.seat }),
          ...(count < 3
            ? { disabledReason: 'Removal requires at least three players.' }
            : !table.canInteract && { disabledReason: 'The table is not taking moves right now.' }),
        }
      : null,
  };
  return (
    <Section hiddenHeading title={player.name}>
      <Stack gap="md">
        <FactionInfoHeader model={model} />
        <SwappingSeat client={client} table={table} seat={player.seat} />
        {details && <FactionDetails faction={details} />}
      </Stack>
    </Section>
  );
}

/* Each player as the compass sees them: a chat each, their faction's information, and what the chat bar shows for them. */

/** The players as the compass shows them: a token each in the chat bar, with what waits on them. */
export function usePlayerWindows(client: TableSession, table: TableProjection) {
  const { conversations } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const votes = table.snapshot.removalVotes ?? [];
  const asked = requestedSeats(table);
  const viewerSeat = table.viewer.viewerSeat;
  const ownFaction = viewerSeat ? seatFaction(table, viewerSeat) : undefined;
  const allies = ownFaction ? alliesOf(table.snapshot.alliances, ownFaction) : [];
  const players: CompassPlayer[] = seatPlayers(table).map((player) => {
    const faction = rosterSeat(table.snapshot.roster, player.seat)?.faction;
    const peerId = seatFaction(table, player.seat);
    const vote = votes.find((entry) => entry.target.seat === player.seat)?.id;
    return {
      ...(vote && { vote }),
      seat: player.seat,
      name: player.name,
      factionName: faction?.name ?? null,
      token: (faction && factionTokenFace(table, faction.id)) ?? standInToken(table, player),
      unread: conversations.summaries.find((entry) => entry.peerId === peerId)?.unread ?? 0,
      own: player.seat === table.viewer.viewerSeat,
      canConverse: Boolean(peerId && conversations.context?.peers.some((peer) => peer.id === peerId)),
      attention: Boolean(vote) || asked.has(player.seat),
      ally: Boolean(peerId && allies.includes(peerId)),
    };
  });
  return {
    players,
    tableChat: conversations.context
      ? { unread: conversations.summaries.find((entry) => entry.peerId === TABLE_CONVERSATION)?.unread ?? 0 }
      : null,
  };
}

/** A seat's faction information, with any vote against its player and any request for the seat. */
export function FactionInfo({ client, table, seat, error }: Props & Readonly<{ seat: string; error: string | null }>) {
  const player = seatPlayers(table).find((entry) => entry.seat === seat);
  if (!player) {
    return null;
  }
  const vote = (table.snapshot.removalVotes ?? []).find((entry) => entry.target.seat === seat);
  return (
    <>
      {error && <FormError title="From the table">{error}</FormError>}
      {vote && <OpenVote client={client} table={table} vote={vote} />}
      <VacantSeatRequests client={client} table={table} seat={seat} />
      <PlayerInformation client={client} table={table} player={player} hasVote={Boolean(vote)} />
    </>
  );
}
