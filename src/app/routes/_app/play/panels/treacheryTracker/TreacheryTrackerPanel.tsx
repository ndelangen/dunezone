import { Text } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { tableProgressFor } from '@shared/play/phases';
import { rosterFactionIds } from '@shared/play/protocol';
import type { TreacheryDeckCard } from '@shared/play/treacheryDeck';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { factionToken } from '../../multiplayer/FactionTokenFace';
import { AuctionTracker } from './AuctionTracker';
import { tableFacts } from './tableFacts';
import { CARD_KINDS } from './tracker';
import type { CardDef, CardKind } from './tracker';
import { storageKey, trackerStore } from './trackerStore';
import type { TrackerStore } from './trackerStore';
import type { TrackerSeat } from './useTrackerSeat';

/* A card's kind is the first word of the line under its name; a card without one counts as a special. */
function kindOf(detail: string): CardKind {
  const word = detail.split('-')[0]?.trim().toLowerCase();
  return CARD_KINDS.find((kind) => kind === word) ?? 'special';
}

function cardDefs(cards: readonly TreacheryDeckCard[]): CardDef[] {
  return cards.map((card) => ({ ...card, kind: kindOf(card.detail) }));
}

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
  /* Listening keeps the store in step with other tabs, so a peek followed here never saves over their edits. */
  useEffect(() => store?.subscribe(() => {}), [store]);
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
