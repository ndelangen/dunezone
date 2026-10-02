import { describe, expect, it } from 'vitest';

import { rosterFactionEventName, rosterFactionLabels, snapshotFactionTieBreaks } from './factionLabels';
import type { TableRoster } from './schema';

function roster(...names: string[]): TableRoster {
  return {
    seatCount: 6,
    seats: names.map((name, index) => ({
      id: `seat-${index + 1}`,
      position: index,
      faction: { id: `faction-${index + 1}`, name, color: '#000' },
    })),
  } as TableRoster;
}

describe('faction labels', () => {
  it('leaves a faction whose name no other seat shares as its name', () => {
    expect(rosterFactionLabels(roster('Harkonnen', 'Atreides'), [{ seat: 'seat-1', name: 'Alice' }])).toEqual({
      'faction-1': 'Harkonnen',
      'faction-2': 'Atreides',
    });
  });

  it('tells same-named factions apart by their players, and by the seat while nobody holds it', () => {
    const holders = [
      { seat: 'seat-1', name: 'Alice' },
      { seat: 'seat-3', name: 'Bob' },
    ];
    expect(rosterFactionLabels(roster('Harkonnen', 'Atreides', 'Harkonnen', 'Harkonnen'), holders)).toEqual({
      'faction-1': 'Harkonnen (Alice)',
      'faction-2': 'Atreides',
      'faction-3': 'Harkonnen (Bob)',
      'faction-4': 'Harkonnen (seat 4)',
    });
  });

  it('falls back to the seat when the players share a name too', () => {
    const holders = [
      { seat: 'seat-1', name: 'Sam' },
      { seat: 'seat-2', name: 'Sam' },
    ];
    expect(rosterFactionLabels(roster('Fremen', 'Fremen'), holders)).toEqual({
      'faction-1': 'Fremen (seat 1)',
      'faction-2': 'Fremen (seat 2)',
    });
  });

  it('names a shared faction name by its seat in a table event, which never names a player', () => {
    expect(rosterFactionEventName(roster('Harkonnen', 'Harkonnen'), 'faction-2')).toBe('Harkonnen (seat 2)');
    expect(rosterFactionEventName(roster('Harkonnen', 'Atreides'), 'faction-2')).toBe('Atreides');
  });

  it('gives only the tie-breakers, for a piece whose label already names its faction', () => {
    const snapshot = {
      roster: roster('Harkonnen', 'Atreides', 'Harkonnen'),
      controls: { players: [{ seat: 'seat-1', name: 'Alice' }] },
    };
    expect(snapshotFactionTieBreaks(snapshot)).toEqual({ 'faction-1': 'Alice', 'faction-3': 'seat 3' });
  });
});
