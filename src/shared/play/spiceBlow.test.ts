import { describe, expect, test } from 'vite-plus/test';

import { retainedArrakisBoard } from '../boards/geometry';
import { boardTerritory, tableTerritoryAt } from '../boards/tableTerritories';
import { applyPieceAction } from './commands';
import { freshTableState } from './model';
import type { TablePiece, TableState } from './model';
import { STANDARD_PHASES } from './phases';
import { GameRejection } from './rejection';
import { isSpicePiece } from './spice';
import { spiceBlowOf } from './spiceBlow';
import { revealedSpiceBlows } from './spiceBlowPlacement';
import { spiceBlowSpot } from './spiceBlowSpot';

const brokenLand = spiceBlowOf('card-spice', { highlights: ['broken-land'], amount: 8 })!;

/* A revealed Broken Land card lying off the board, beside where the spice deck sits. */
function revealedCard(faceUp = true): TablePiece {
  return {
    id: 'blow-card',
    label: '',
    owner: 'shared',
    color: '#d5ba8c',
    accent: '#ead9bb',
    kind: 'card',
    stackKey: 'deck:spice',
    items: [
      {
        id: 'blow-card-1',
        faceUp,
        artwork: {
          back: 'https://example.test/back.jpg',
          name: 'Broken Land',
          type: 'card-spice',
          spiceBlow: brokenLand,
        },
      },
    ],
    position: [5.2, 0, 1],
    orientation: 0,
    flipRevision: 0,
    zoneId: null,
    locked: false,
  };
}

function tableWithCard(faceUp = true): TableState {
  const state = freshTableState();
  return { ...state, pieces: [...state.pieces, revealedCard(faceUp)] };
}

/* Phase index 1 is turn 1's Spice Blow; a full round of phases later is turn 2's. */
const place = (state: TableState, phase = 1) => {
  const spot = spiceBlowSpot(
    {},
    state.pieces,
    state.pieces.find((piece) => piece.id === 'blow-card')!
  );
  if (!spot) {
    throw new Error('No spot');
  }
  return applyPieceAction(state, { kind: 'spice-blow', ...spot }, phase, 'Alice', STANDARD_PHASES);
};

describe('spice blow capture', () => {
  test('reads a classic card highlight as the territory ID and keeps its amount', () => {
    expect(brokenLand).toEqual({ amount: 8, territories: ['broken_land'] });
  });

  test('a card that names no territory, as Shai-Hulud, places nothing', () => {
    expect(spiceBlowOf('card-spice', { highlights: [], amount: 1 })).toBeUndefined();
    expect(spiceBlowOf('card-treachery', { highlights: ['broken-land'], amount: 8 })).toBeUndefined();
  });

  test("a linked board's spice-stamped tint names the territory and its tokens the spots", () => {
    const blow = spiceBlowOf('card-spice', {
      highlights: [],
      amount: 6,
      board: {
        asset_id: 'arrakis-board',
        tints: [
          { territories: ['pasty_mesa'], outline: true },
          { territories: ['funeral_plain'], stamps: ['spice'] },
        ],
        tokens: [{ x: 150, y: 370 }],
      },
    });
    expect(blow).toEqual({ amount: 6, territories: ['funeral_plain'], spots: [[150, 370]], boardId: 'arrakis-board' });
  });
});

describe('placing a revealed spice card', () => {
  test("puts the card's spice in a free spot inside its territory, and again onto that spice", () => {
    const state = tableWithCard();
    const spot = spiceBlowSpot({}, state.pieces, state.pieces.at(-1)!)!;
    expect(spot.name).toBe(boardTerritory(retainedArrakisBoard(), 'broken_land')!.name);
    expect(tableTerritoryAt(retainedArrakisBoard(), spot.position[0], spot.position[2])?.id).toBe('broken_land');
    expect(revealedSpiceBlows(state.pieces)).toEqual([{ pieceId: 'blow-card', blow: brokenLand }]);

    const next = place(state);
    const added = next.pieces.filter(isSpicePiece);
    expect(added).toHaveLength(1);
    expect(added[0]!.items).toHaveLength(8);
    expect(next.events[0]?.message).toBe(`Alice placed 8 spice on ${spot.name}.`);

    /* A second blow of the same card joins the spice already lying in the territory. */
    const again = place(next);
    const piles = again.pieces.filter(isSpicePiece);
    expect(piles).toHaveLength(1);
    expect(piles[0]!.items).toHaveLength(16);
    expect(new Set(piles[0]!.items.map((item) => item.id)).size).toBe(16);
  });

  test('a face-down card or another territory is refused', () => {
    const hidden = tableWithCard(false);
    expect(spiceBlowSpot({}, hidden.pieces, hidden.pieces.at(-1)!)).toBeNull();
    expect(() =>
      applyPieceAction(
        hidden,
        {
          kind: 'spice-blow',
          pieceId: 'blow-card',
          territory: 'broken_land',
          name: 'Broken Land',
          position: [0, 0, 0],
        },
        1
      )
    ).toThrow(GameRejection);
    expect(() =>
      applyPieceAction(
        tableWithCard(),
        { kind: 'spice-blow', pieceId: 'blow-card', territory: 'arrakeen', name: 'Arrakeen', position: [0, 0, 0] },
        1
      )
    ).toThrow(GameRejection);
  });
});
