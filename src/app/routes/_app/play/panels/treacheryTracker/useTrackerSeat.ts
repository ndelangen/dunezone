import type { TreacheryDeckCard } from '@shared/play/treacheryDeck';
import { useEffect, useSyncExternalStore } from 'react';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { seatFaction } from '../../multiplayer/tableFactions';

/** The tracker a seat may keep: its faction and the game's Treachery deck. */
export type TrackerSeat = Readonly<{ faction: string; cards: readonly TreacheryDeckCard[] }>;

/**
 * The viewer's tracker, when the room answers its deck read: the room answers only a seat whose faction's captured rules keep the tracker.
 * The read waits for an authorized connection and is asked again after a reconnect, as a faction's sheet is.
 */
export function useTrackerSeat(client: TableSession, table: TableProjection): TrackerSeat | null {
  const { status, treacheryDeck, treacheryDeckSeat } = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot
  );
  const seat = table.viewer.viewerSeat ?? null;
  const faction = seat ? seatFaction(table, seat) : undefined;
  useEffect(() => {
    if (faction && status === 'authorized') {
      client.readTreacheryDeck(seat);
    }
  }, [client, faction, seat, status]);
  /* A deck read for another seat, before this seat's read goes out, is not this seat's. */
  return faction && treacheryDeck && treacheryDeckSeat === seat ? { faction, cards: treacheryDeck } : null;
}
