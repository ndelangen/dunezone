import { Text } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { tableProgressFor } from '@shared/play/phases';
import { rosterFactionIds } from '@shared/play/protocol';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { AuctionTracker } from '@app/widgets/treachery-tracker/AuctionTracker';
import { cardDefs } from '@app/widgets/treachery-tracker/tracker';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { factionToken } from '../../multiplayer/FactionTokenFace';
import { tableFacts } from './tableFacts';
import { storageKey, trackerStore } from './trackerStore';
import type { TrackerStore } from './trackerStore';
import type { TrackerSeat } from './useTrackerSeat';

function TrackerAtTable({ store, table }: Readonly<{ store: TrackerStore; table: TableProjection }>) {
  const { state } = useSyncExternalStore(store.subscribe, store.get, store.get);
  const factionIds = rosterFactionIds(table.snapshot.roster);
  const names = snapshotFactionLabels(table.snapshot);
  const factions = factionIds.map((id) => factionToken(table, id, names));
  const { turn } = tableProgressFor(table.snapshot.phase, table.snapshot.phases);
  return <AuctionTracker factions={factions} state={state} onAction={store.dispatch} tableTurn={turn} />;
}

/* The seat's tracker store, made from the game's deck and the seated factions; null when the game has no Treachery deck. */
function useSeatStore(client: TableSession, table: TableProjection, tracker: TrackerSeat) {
  const defs = useMemo(() => cardDefs(tracker.cards), [tracker.cards]);
  const factionIds = rosterFactionIds(table.snapshot.roster);
  const key = storageKey(table.viewer.userId, client.game, tracker.faction);
  /* Keyed by its storage, so a seat that changes faction never writes one faction's tracker under another's key. */
  return defs.length > 0 ? { key, defs, store: trackerStore(key, defs, factionIds) } : null;
}

/**
 * Follows the live table for the seat's tracker while the game runs, whether or not the panel is open (#2794): a peek at the card up for bid puts it up for bid.
 * It renders nothing;
 * a review or a checkpoint shown from the past is never followed.
 */
export function TreacheryTrackerFollower({
  client,
  table,
  tracker,
}: Readonly<{ client: TableSession; table: TableProjection; tracker: TrackerSeat }>) {
  const seat = useSeatStore(client, table, tracker);
  const faces = useMemo(() => new Set(seat?.defs.map((def) => def.face)), [seat?.defs]);
  const live = table.playback === null;
  const store = seat?.store;
  useEffect(() => {
    if (store && live) {
      store.follow(tableFacts(table.snapshot, faces));
    }
  }, [store, live, table.snapshot, faces]);
  return null;
}

/** The Treachery tracker at a table, loaded only when the seat keeps one: the game's own Treachery deck, and the seated factions in seat order. */
export function ConnectedTreacheryTrackerPanel({
  client,
  table,
  tracker,
}: Readonly<{ client: TableSession; table: TableProjection; tracker: TrackerSeat }>) {
  const seat = useSeatStore(client, table, tracker);
  if (!seat) {
    return (
      <Text size="sm" c="dimmed">
        This game has no Treachery deck to track.
      </Text>
    );
  }
  return <TrackerAtTable key={seat.key} store={seat.store} table={table} />;
}
