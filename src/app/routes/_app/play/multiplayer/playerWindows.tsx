import { alliesOf } from '@shared/play/alliances';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { PublicControls } from '@shared/play/inventory';
import { rosterSeat } from '@shared/play/schema';
import { useSyncExternalStore } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import type { CompassPlayer } from '../compass/compassTable';
import { factionTokenFace } from './FactionTokenFace';
import { requestedSeats } from './SeatRequests';
import { seatFaction } from './tableFactions';

export type Player = PublicControls['players'][number];

/* Every seat's player, a vacant seat by its faction; the viewer's own seat comes last. */
export function seatPlayers(table: TableProjection): Player[] {
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

/* What a seat shows where the table has no token for its faction: the token it holds while trading seats, else its player's avatar. */
export function standInToken(table: TableProjection, player: Player) {
  return table.snapshot.swapping?.tokens[player.seat] ?? player.avatar ?? null;
}

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
