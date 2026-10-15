import { describe, expect, it } from 'vite-plus/test';

import { clampHiddenZoneSpot, hiddenZoneFootprint, hiddenZonePieces, nextHiddenZoneSpot } from './hiddenZone';
import type { TablePiece } from './model';
import { CARD_DEPTH, CARD_WIDTH, TROOP_FOOTPRINT_RADIUS } from './tableGeometry';

function piece(id: string, kind: TablePiece['kind'], extra: Partial<TablePiece> = {}, size?: number): TablePiece {
  return {
    id,
    label: id,
    owner: 'atreides',
    color: '#000000',
    accent: '#ffffff',
    items: [
      {
        id: `${id}-item`,
        faceUp: true,
        artwork: { back: 'https://example.test/back.png', type: 'token-disc', ...(size ? { size } : {}) },
      },
    ],
    stackKey: null,
    position: [0, 0, 0],
    orientation: 0,
    zoneId: null,
    locked: false,
    kind,
    ...extra,
  };
}

describe('hiddenZoneFootprint', () => {
  it('lays a card at its table size', () => {
    expect(hiddenZoneFootprint(piece('card', 'card'))).toEqual({ width: CARD_WIDTH, depth: CARD_DEPTH });
  });

  it('lays a token at its table size, scaled by the physical size its author set', () => {
    const standard = hiddenZoneFootprint(piece('token', 'force'));
    expect(standard.width).toBeCloseTo(2 * TROOP_FOOTPRINT_RADIUS);
    const small = hiddenZoneFootprint(piece('marker', 'force', {}, 0.35));
    expect(small.width).toBeCloseTo(standard.width * 0.35);
    expect(small.depth).toBeCloseTo(standard.depth * 0.35);
  });
});

describe('hiddenZonePieces', () => {
  it('draws only the pieces laid in the zone, cards below tokens, each kind in the order it was arranged', () => {
    const at = { x: 0.5, y: 0.5 };
    const hand = [
      piece('token-a', 'force', { hiddenZone: at }),
      piece('card-a', 'card', { hiddenZone: at }),
      piece('loose', 'card'),
      piece('token-b', 'force', { hiddenZone: at }),
      piece('card-b', 'card', { hiddenZone: at }),
    ];
    expect(hiddenZonePieces(hand).map((entry) => entry.id)).toEqual(['card-a', 'card-b', 'token-a', 'token-b']);
  });
});

describe('nextHiddenZoneSpot', () => {
  it('cascades pieces moved in one after another so they do not land on each other', () => {
    const first = nextHiddenZoneSpot([]);
    const second = nextHiddenZoneSpot([piece('laid', 'card', { hiddenZone: first })]);
    expect(second).not.toEqual(first);
    for (const spot of [first, second]) {
      expect(clampHiddenZoneSpot(spot)).toEqual(spot);
    }
  });
});

describe('clampHiddenZoneSpot', () => {
  it('keeps a spot dropped past an edge inside the zone', () => {
    expect(clampHiddenZoneSpot({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 });
  });
});
