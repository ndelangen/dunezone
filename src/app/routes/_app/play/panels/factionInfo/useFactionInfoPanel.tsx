import { Avatar } from '@mantine/core';
import type { PublicFaction } from '@shared/play/capture';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { RemovalVote } from '@shared/play/removal';
import { rosterSeat } from '@shared/play/schema';
import type { ReactNode } from 'react';
import { useEffect, useSyncExternalStore } from 'react';

import { useFactionPageSlug } from '@db/factions';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { factionToken, FactionTokenFace } from '../../multiplayer/FactionTokenFace';
import { seatPlayers, standInToken } from '../../multiplayer/playerWindows';
import type { Player } from '../../multiplayer/playerWindows';
import { VacantSeatRequests } from '../../multiplayer/SeatRequests';
import { SwappingSeat } from '../../multiplayer/Swapping';
import { isSpectator } from '../../multiplayer/tableFactions';
import { useServerNow } from '../../multiplayer/useServerNow';
import type { AllianceCommandKind } from '../alliances/alliances';
import { sendAllianceAction } from '../alliances/useAlliancesPanel';
import type { FactionInfoHeaderModel } from './FactionInfoHeader';
import { FactionInfoPanel } from './FactionInfoPanel';
import type { BallotChoice, FactionInfoPanelProps, RemovalVoteView } from './FactionInfoPanel';
import { seatAlliance } from './seatAlliance';

/* Another seated player, under no vote yet, can be put to one by a seated viewer. */
function removable(table: TableProjection, seat: string, hasVote: boolean) {
  return (
    table.snapshot.controls?.players.some((entry) => entry.seat === seat) &&
    !hasVote &&
    table.viewer.viewerSeat !== seat &&
    !isSpectator(table)
  );
}

/* The vote as the viewer sees it, at the table's time in milliseconds. */
function voteView(table: TableProjection, vote: RemovalVote, now: number): RemovalVoteView {
  const approvals = vote.ballots.filter((ballot) => ballot.choice === 'remove').length;
  const against = vote.ballots.filter((ballot) => ballot.choice === 'keep').length;
  const own = vote.ballots.find((ballot) => ballot.seat === table.viewer.viewerSeat);
  return {
    target: vote.target.name,
    ballots: vote.ballots,
    needed: {
      remove: Math.max(0, vote.threshold - approvals),
      keep: Math.max(0, vote.ballots.length - vote.threshold + 1 - against),
    },
    elapsed: Math.max(0, Math.floor((now - vote.openedAt) / 1000)),
    ballot:
      table.canInteract && own !== undefined
        ? { choice: own.choice }
        : {
            reason:
              table.viewer.viewerSeat === vote.target.seat
                ? 'You cannot vote on your own removal.'
                : 'Only eligible players can vote.',
          },
  };
}

/* The top of the seat's information: who sits there, their faction, their alliance and what the viewer can do about them. */
function headerModel(
  table: TableProjection,
  player: Player,
  sources: Pick<FactionInfoSources, 'slug' | 'onAlliance' | 'onStartRemoval'> & Readonly<{ hasVote: boolean }>
): FactionInfoHeaderModel {
  const faction = rosterSeat(table.snapshot.roster, player.seat)?.faction;
  const count = table.snapshot.controls?.players.length ?? 0;
  const names = snapshotFactionLabels(table.snapshot);
  return {
    token: faction ? (
      <FactionTokenFace token={factionToken(table, faction.id, names, standInToken(table, player))} size={44} />
    ) : (
      <Avatar src={standInToken(table, player)} size={44} radius="xl" alt="">
        {player.name.slice(0, 1)}
      </Avatar>
    ),
    name: player.name,
    seatId: player.seat,
    faction: faction?.name ?? null,
    seat: player.seat.replace('seat-', 'Seat '),
    own: player.seat === table.viewer.viewerSeat,
    alliance: seatAlliance(table, player.seat, sources.onAlliance),
    page:
      sources.slug && faction ? { href: `/factions/${encodeURIComponent(sources.slug)}`, name: faction.name } : null,
    removal: removable(table, player.seat, sources.hasVote)
      ? {
          start: () => sources.onStartRemoval(player.seat),
          ...(count < 3
            ? { disabledReason: 'Removal requires at least three players.' }
            : !table.canInteract && { disabledReason: 'The table is not taking moves right now.' }),
        }
      : null,
  };
}

/** What the window reads beyond the table: the faction's sheet and page, the table's time, the parts it shows as they are, and where its actions go. */
export type FactionInfoSources = Readonly<{
  error: string | null;
  details: PublicFaction | undefined;
  slug: string | null | undefined;
  now: number;
  requests: ReactNode;
  swapping: ReactNode;
  onBallot: (voteId: string, choice: BallotChoice | null) => void;
  onStartRemoval: (seat: string) => void;
  onAlliance: (factionId: string, kind: AllianceCommandKind) => void;
}>;

/** The Faction info window's props for a seat, or null for a seat nobody can be shown at. */
export function factionInfoProps(
  table: TableProjection,
  seat: string,
  sources: FactionInfoSources
): FactionInfoPanelProps | null {
  const player = seatPlayers(table).find((entry) => entry.seat === seat);
  if (!player) {
    return null;
  }
  const vote = (table.snapshot.removalVotes ?? []).find((entry) => entry.target.seat === seat);
  return {
    error: sources.error,
    vote: vote ? voteView(table, vote, sources.now) : null,
    requests: sources.requests,
    header: headerModel(table, player, { ...sources, hasVote: Boolean(vote) }),
    swapping: sources.swapping,
    details: sources.details,
    onBallot: (choice) => vote && sources.onBallot(vote.id, choice),
  };
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
  return { slug, details: factionId ? (factions[factionId] ?? undefined) : undefined };
}

/** A seat's Faction info at a live table. */
export function ConnectedFactionInfoPanel({
  client,
  table,
  seat,
  error,
}: Readonly<{ client: TableSession; table: TableProjection; seat: string; error: string | null }>) {
  const now = useServerNow();
  const { slug, details } = useFactionDetails(client, rosterSeat(table.snapshot.roster, seat)?.faction?.id);
  const props = factionInfoProps(table, seat, {
    error,
    details,
    slug,
    now,
    requests: <VacantSeatRequests client={client} table={table} seat={seat} />,
    swapping: <SwappingSeat client={client} table={table} seat={seat} />,
    onBallot: (voteId, choice) => client.command({ kind: 'removal-ballot', voteId, choice }),
    onStartRemoval: (target) => client.command({ kind: 'removal-start', seat: target }),
    onAlliance: (factionId, kind) => sendAllianceAction(client, table, factionId, kind),
  });
  return props && <FactionInfoPanel {...props} />;
}
