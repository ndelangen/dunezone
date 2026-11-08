import { Text } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { tableProgressFor } from '@shared/play/phases';
import { rosterFactionIds } from '@shared/play/protocol';
import type { TreacheryDeckCard } from '@shared/play/treacheryDeck';
import { useEffect, useMemo, useReducer } from 'react';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { AuctionTracker } from '../../../../../widgets/treachery-tracker/AuctionTracker';
import { CARD_KINDS, newTracker, trackerReducer } from '../../../../../widgets/treachery-tracker/tracker';
import type { CardDef, CardKind, TrackerState } from '../../../../../widgets/treachery-tracker/tracker';
import { factionToken } from '../../multiplayer/FactionTokenFace';
import type { TrackerSeat } from './useTrackerSeat';

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

/* A stored tracker is used only when every card it names is in this deck; anything else, such as an older shape, starts afresh. */
function readable(value: unknown, fresh: TrackerState): value is TrackerState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Partial<TrackerState>;
  const ids = new Set(fresh.copies.map((copy) => copy.id));
  const named = (card: unknown) => card === null || (typeof card === 'string' && ids.has(card));
  return (
    Array.isArray(state.copies) &&
    state.copies.length === fresh.copies.length &&
    state.copies.every((copy) => ids.has(copy?.id)) &&
    Array.isArray(state.discard) &&
    state.discard.every(named) &&
    Array.isArray(state.seen) &&
    state.seen.every((sighting) => typeof sighting?.id === 'string' && named(sighting.card)) &&
    typeof state.hands === 'object' &&
    state.hands !== null &&
    Object.values(state.hands).every(
      (slots) => Array.isArray(slots) && slots.every((slot) => typeof slot?.id === 'string' && named(slot.card))
    ) &&
    typeof state.notes === 'object' &&
    typeof state.nextSlot === 'number'
  );
}

function restored(key: string, defs: readonly CardDef[], factions: readonly string[]): TrackerState {
  const fresh = newTracker(defs, factions);
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    /* The stored copies carry the deck as it was saved; the game's own deck replaces them, card for card. */
    return readable(stored, fresh) ? { ...stored, copies: fresh.copies } : fresh;
  } catch {
    return fresh;
  }
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
  const { turn } = tableProgressFor(table.snapshot.phase, table.snapshot.phases);
  return <AuctionTracker factions={factions} state={state} onAction={dispatch} tableTurn={turn} />;
}

/** The Treachery tracker at a table, loaded only when the seat keeps one: the game's own Treachery deck, and the seated factions in seat order. */
export function ConnectedTreacheryTrackerPanel({
  client,
  table,
  tracker,
}: Readonly<{ client: TableSession; table: TableProjection; tracker: TrackerSeat }>) {
  const defs = useMemo(() => cardDefs(tracker.cards), [tracker.cards]);
  if (defs.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        This game has no Treachery deck to track.
      </Text>
    );
  }
  const storage = storageKey(client.game, tracker.faction);
  /* Keyed by its storage, so a seat that changes faction never writes one faction's tracker under another's key. */
  return <TrackerAtTable key={storage} storage={storage} defs={defs} table={table} />;
}
