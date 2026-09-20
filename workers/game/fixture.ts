import { fixtureCombatFaces } from '../../src/shared/play/battle';
import { initialSnapshot } from '../../src/shared/play/commands';
import type { SpawnContents, SpawnSelection } from '../../src/shared/play/inventory';
import { LOAD_SEATS, loadSnapshot } from '../../src/shared/play/loadFixture';
import type { LoadProfile } from '../../src/shared/play/loadFixture';
import type { TablePiece } from '../../src/shared/play/model';
import { tableSeatCountSchema } from '../../src/shared/play/schema';
import type { TableRoster } from '../../src/shared/play/schema';
import { DEFAULT_TABLE_SEAT_COUNT } from '../../src/shared/play/tableSettings';
import { DEFAULT_SEAT_COLOR } from './actors';
import { shuffledCards } from './decks';
import { storedSnapshotSchema } from './state';
import type { StoredSnapshot } from './state';

/*
 * The hosted fixture seats two houses at the first two of six stations, each seat named after the
 * house it carries; a load fixture seats the agreed eighteen players with no faction at all.
 * A real game fixes its own seating at public assignment and never reads this file.
 */
const HOSTED_FIXTURE_SEATS: TableRoster['seats'] = [
  { id: 'harkonnen', position: 0, faction: { id: 'harkonnen', name: 'Harkonnen', color: '#ed927c' } },
  { id: 'atreides', position: 1, faction: { id: 'atreides', name: 'Atreides', color: '#75d8a7' } },
];

export function fixtureRoster(loadProfile?: LoadProfile): TableRoster {
  if (loadProfile) {
    return {
      seatCount: tableSeatCountSchema.parse(LOAD_SEATS.length),
      seats: LOAD_SEATS.map((id, position) => ({ id, position, faction: null })),
    };
  }
  return { seatCount: DEFAULT_TABLE_SEAT_COUNT, seats: HOSTED_FIXTURE_SEATS };
}

/*
 * A room from before the seats table kept only which faction sat where. Those rows keep their
 * order as stations, and a house the fixture knows keeps its name and colour.
 */
export function legacyFixtureRoster(
  rows: readonly { faction_id: string; seat: string }[],
  loadProfile?: LoadProfile
): TableRoster {
  if (loadProfile || !rows.length) {
    return fixtureRoster(loadProfile);
  }
  return {
    seatCount: DEFAULT_TABLE_SEAT_COUNT,
    seats: rows.map((row, position) => ({
      id: row.seat,
      position,
      faction: HOSTED_FIXTURE_SEATS.find((seat) => seat.faction?.id === row.faction_id)?.faction ?? {
        id: row.faction_id,
        name: row.faction_id,
        color: DEFAULT_SEAT_COLOR,
      },
    })),
  };
}

/** Every seated house holds a bank and its fixture combat faces; a house that already has them keeps them. */
export function seedFactionState(snapshot: StoredSnapshot, roster: TableRoster): StoredSnapshot {
  const factions = roster.seats.flatMap((seat) => (seat.faction ? [seat.faction.id] : []));
  return {
    ...snapshot,
    roster,
    factionBanks: { ...Object.fromEntries(factions.map((id) => [id, 0])), ...snapshot.factionBanks },
    combatFaces: {
      ...Object.fromEntries(factions.map((id) => [id, fixtureCombatFaces(id)])),
      ...snapshot.combatFaces,
    },
  };
}

/** The catalogue deck the hosted fixture deals as its treachery cards, when the catalogue can supply it. */
export const FIXTURE_TREACHERY_DECK: SpawnSelection = { type: 'deck', slug: 'dreamrules-treachery-deck' };
const FIXTURE_DECK_PIECE = 'treachery-deck';
const FIXTURE_LOOSE_CARD_PIECE = 'treachery-card-loose';

/*
 * Deals a captured deck into the fixture's treachery pieces: the cards are shuffled with fresh
 * identities, as every supplied deck is, so neither the catalogue's member order nor an earlier
 * deal says what a face-down card is; all but one go face down on the deck, the last lies face
 * up as the loose card. Piece ids, labels, colours and positions stay the fixture's own, so every
 * flow and story that addresses them reads unchanged; only the cards carry the catalogue's
 * published faces and the deck's back. A deck that is not one card stack of at least two cards
 * (one for the deck, one for the loose card), or a table without the fixture pieces, is left as it is.
 */
export function dealFixtureDeck<Table extends { pieces: TablePiece[] }>(table: Table, deck: SpawnContents): Table {
  const cards = deck.pieces.length === 1 && deck.pieces[0]!.kind === 'card' ? deck.pieces[0]!.items : [];
  if (cards.length < 2 || !table.pieces.some((piece) => piece.id === FIXTURE_DECK_PIECE)) {
    return table;
  }
  const items = shuffledCards(cards).map((item) => ({ ...item, id: crypto.randomUUID() }));
  const loose = { ...items[items.length - 1]!, faceUp: true };
  return {
    ...table,
    pieces: table.pieces.flatMap((piece) => {
      switch (piece.id) {
        case FIXTURE_DECK_PIECE:
          return [{ ...piece, items: items.slice(0, -1) }];
        case FIXTURE_LOOSE_CARD_PIECE:
          return [{ ...piece, items: [loose] }];
        default:
          return [piece];
      }
    }),
  };
}

/** A fixture's first snapshot: its pieces, its seating and an empty bank for each seated house. */
export function fixtureSnapshot(roster: TableRoster, loadProfile?: LoadProfile, deck?: SpawnContents): StoredSnapshot {
  const snapshot = storedSnapshotSchema.parse(loadProfile ? loadSnapshot(loadProfile) : initialSnapshot());
  return seedFactionState(
    deck && !loadProfile ? { ...snapshot, table: dealFixtureDeck(snapshot.table, deck) } : snapshot,
    roster
  );
}
