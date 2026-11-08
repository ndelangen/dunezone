import { Text } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { rosterFactionIds } from '@shared/play/protocol';
import type { TreacheryDeckCard } from '@shared/play/treacheryDeck';
import { useEffect, useMemo, useReducer, useSyncExternalStore } from 'react';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { AuctionTracker } from '../../../../../widgets/treachery-tracker/AuctionTracker';
import { CARD_KINDS, newTracker, trackerReducer } from '../../../../../widgets/treachery-tracker/tracker';
import type { CardDef, CardKind, TrackerState } from '../../../../../widgets/treachery-tracker/tracker';
import { factionToken } from '../../multiplayer/FactionTokenFace';
import { seatFaction } from '../../multiplayer/tableFactions';

/** The viewer's own faction, when its captured rules let it keep the Treachery tracker; the faction's sheet is asked for once. */
export function useTrackerFaction(client: TableSession, table: TableProjection): string | null {
  const { factions } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const seat = table.viewer.viewerSeat;
  const own = seat ? seatFaction(table, seat) : undefined;
  useEffect(() => {
    if (own) {
      client.readFaction(own);
    }
  }, [client, own]);
  return own && factions[own]?.rules.treacheryTracker ? own : null;
}

/* A card's kind is the first word of the line under its name; a card without one counts as a special. */
function kindOf(detail: string): CardKind {
  const word = detail
    .split(/\s*-\s*/)[0]
    ?.trim()
    .toLowerCase();
  return CARD_KINDS.find((kind) => kind === word) ?? 'special';
}

function cardDefs(cards: readonly TreacheryDeckCard[]): CardDef[] {
  return cards.map((card) => ({ ...card, kind: kindOf(card.detail) }));
}

/* What the tracker remembers lives in this browser only, per game and faction: no other player ever receives it. */
function storageKey(game: string, faction: string) {
  return `dune-zone:treachery-tracker:${game}:${faction}`;
}

function restored(key: string, defs: readonly CardDef[], factions: readonly string[]): TrackerState {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as TrackerState;
    }
  } catch {
    /* Storage that cannot be read starts the tracker afresh. */
  }
  return newTracker(defs, factions);
}

function TrackerAtTable({
  storage,
  defs,
  table,
}: Readonly<{ storage: string; defs: readonly CardDef[]; table: TableProjection }>) {
  const factionIds = rosterFactionIds(table.snapshot.roster);
  const [state, dispatch] = useReducer(trackerReducer, undefined, () => restored(storage, defs, factionIds));
  useEffect(() => {
    try {
      window.localStorage.setItem(storage, JSON.stringify(state));
    } catch {
      /* A full or blocked storage only loses the tracker on reload. */
    }
  }, [storage, state]);
  const names = snapshotFactionLabels(table.snapshot);
  const factions = factionIds.map((id) => factionToken(table, id, names));
  return <AuctionTracker factions={factions} state={state} onAction={dispatch} />;
}

/** The Treachery tracker at a table: the game's own Treachery deck, and the seated factions in seat order. */
export function ConnectedTreacheryTrackerPanel({
  client,
  table,
  faction,
}: Readonly<{ client: TableSession; table: TableProjection; faction: string }>) {
  const { treacheryDeck } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => client.readTreacheryDeck(), [client]);
  const defs = useMemo(() => (treacheryDeck ? cardDefs(treacheryDeck) : null), [treacheryDeck]);
  if (treacheryDeck === undefined) {
    return (
      <Text size="sm" c="dimmed">
        Reading the game's Treachery deck…
      </Text>
    );
  }
  if (!defs) {
    return (
      <Text size="sm" c="dimmed">
        This game has no Treachery deck to track.
      </Text>
    );
  }
  return <TrackerAtTable storage={storageKey(client.game, faction)} defs={defs} table={table} />;
}
