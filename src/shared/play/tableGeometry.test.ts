import { describe, expect, it } from 'vite-plus/test';

import type { TablePiece } from './model';
import { circleFootprintRadius, TROOP_FOOTPRINT_RADIUS, troopScale } from './tableGeometry';

function token(size?: number): Pick<TablePiece, 'kind' | 'stackKey' | 'items'> {
  return {
    kind: 'force',
    stackKey: 'token:discovery',
    items: [
      {
        id: 'discovery',
        faceUp: true,
        artwork: { back: 'https://example.test/back.png', type: 'token-disc', ...(size ? { size } : {}) },
      },
    ],
  };
}

describe('troopScale', () => {
  it('draws a token at the physical size its author set, on the table as on the side-table (#2994)', () => {
    expect(troopScale(token())).toBe(1);
    expect(troopScale(token(1.6))).toBeCloseTo(1.6);
    expect(circleFootprintRadius({ ...token(1.6), position: [0, 0, 0] } as TablePiece)).toBeCloseTo(
      TROOP_FOOTPRINT_RADIUS * 1.6
    );
  });
});
