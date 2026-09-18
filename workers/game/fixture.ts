import { fixtureCombatFaces } from '../../src/shared/play/battle';
import { initialSnapshot } from '../../src/shared/play/commands';
import { LOAD_SEATS, loadSnapshot } from '../../src/shared/play/loadFixture';
import type { LoadProfile } from '../../src/shared/play/loadFixture';
import { tableSeatCountSchema } from '../../src/shared/play/schema';
import type { TableRoster } from '../../src/shared/play/schema';
import { DEFAULT_TABLE_SEAT_COUNT } from '../../src/shared/play/tableSettings';
import { DEFAULT_SEAT_COLOR } from './actors';
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

/** A fixture's first snapshot: its pieces, its seating and an empty bank for each seated house. */
export function fixtureSnapshot(roster: TableRoster, loadProfile?: LoadProfile): StoredSnapshot {
  return seedFactionState(
    storedSnapshotSchema.parse(loadProfile ? loadSnapshot(loadProfile) : initialSnapshot()),
    roster
  );
}
