import { describe, expect, it } from 'vitest';

import { handCountGrid, treacheryHandCounts } from './handCounts';
import type { StoredPiece } from './model';

function hand(id: string, kind: StoredPiece['kind'], types: string[]): StoredPiece {
  return {
    id,
    label: id,
    owner: 'atreides',
    color: '#000',
    accent: '#fff',
    kind,
    stackKey: id,
    items: types.map((type, index) => ({
      id: `${id}-${index}`,
      faceUp: false,
      artwork: { front: '/f.png', back: '/b.png', name: type, type },
    })),
    position: [0, 0, 0],
    orientation: 0,
    zoneId: null,
    locked: false,
  };
}

describe('treacheryHandCounts', () => {
  it('counts only Treachery cards, and names every listed faction', () => {
    const counts = treacheryHandCounts(
      {
        atreides: [
          hand('t1', 'card', ['card-treachery']),
          hand('t2', 'card', ['card-treachery', 'card-treachery']),
          hand('traitor', 'card', ['card-traitor']),
          hand('alliance', 'card', ['card-alliance']),
          hand('leader', 'force', ['token-disc']),
        ],
      },
      ['atreides', 'fremen']
    );
    expect(counts).toEqual({ atreides: 3, fremen: 0 });
  });
});

describe('handCountGrid', () => {
  it('lays six factions out two by three in the portrait slot', () => {
    expect(handCountGrid(6, 1.75, 1000, 1300)).toMatchObject({ cols: 2, rows: 3 });
  });

  it('fits up to eighteen factions without overflowing', () => {
    for (let count = 1; count <= 18; count += 1) {
      const { cols, rows, size } = handCountGrid(count, 1.75, 1000, 1300);
      expect(cols * rows).toBeGreaterThanOrEqual(count);
      expect(cols * size * 1.75).toBeLessThanOrEqual(1000 + 1e-6);
      expect(rows * size).toBeLessThanOrEqual(1300 + 1e-6);
    }
  });
});
