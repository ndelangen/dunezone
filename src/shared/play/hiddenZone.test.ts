import { describe, expect, it } from 'vite-plus/test';

import {
  clampHiddenZoneSpot,
  HIDDEN_ZONE_MIN_SCALE,
  hiddenZoneFootprint,
  hiddenZonePieces,
  hiddenZoneView,
  nextHiddenZoneSpot,
} from './hiddenZone';
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

  it('keeps the cascade apart inside a zone narrower than the standard patch', () => {
    const { extent } = hiddenZoneView(220, 400);
    expect(extent.x).toBeLessThan(0.5);
    const hand: ReturnType<typeof piece>[] = [];
    const spots = Array.from({ length: 7 }, (_, index) => {
      const spot = nextHiddenZoneSpot(hand, extent);
      hand.push(piece(`laid-${index}`, 'force', { hiddenZone: spot }));
      return spot;
    });
    for (const spot of spots) {
      expect(clampHiddenZoneSpot(spot, extent)).toEqual(spot);
    }
    expect(new Set(spots.map((spot) => spot.x)).size).toBe(7);
  });

  it('cascades as before in a zone the standard patch fits', () => {
    expect(nextHiddenZoneSpot([], { x: 1.6, y: 1.2 })).toEqual(nextHiddenZoneSpot([]));
  });
});

describe('clampHiddenZoneSpot', () => {
  it('keeps a spot dropped past an edge inside the zone', () => {
    expect(clampHiddenZoneSpot({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 });
  });

  it('keeps a spot inside the zone a roomier view shows', () => {
    expect(clampHiddenZoneSpot({ x: 0.5, y: 3.4 }, { x: 1.2, y: 2.5 })).toEqual({ x: 0.5, y: 2.5 });
  });
});

describe('hiddenZoneView', () => {
  it('fits the standard patch in a wide view and adds the room left over', () => {
    const view = hiddenZoneView(1280, 280);
    expect(view.scale).toBe(100);
    expect(view.extent).toEqual({ x: 2, y: 1 });
  });

  it('keeps pieces from shrinking in a narrow column, showing part of the patch across and more of it down', () => {
    const view = hiddenZoneView(288, 1008);
    expect(view.scale).toBe(HIDDEN_ZONE_MIN_SCALE);
    expect(view.extent.x).toBeCloseTo(0.625);
    expect(view.extent.y).toBeCloseTo(5);
  });

  it('draws nothing before the view has a size', () => {
    expect(hiddenZoneView(0, 0).scale).toBe(0);
  });
});
