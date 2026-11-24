import { describe, expect, test } from 'vite-plus/test';

import { placeStickers, TABLE_STICKER_LARGEST } from '../boards/stickerPlacement';
import { boardPointToTable, boardTerritory, tableTerritoryAt } from '../boards/tableTerritories';
import { applyPieceAction } from './commands';
import { arrakisBoardCapture } from './fixtures/board';
import { freshTableState } from './model';
import type { TableItem, TablePiece, TableState } from './model';
import { STANDARD_PHASES } from './phases';
import { GameRejection } from './rejection';
import { isSpicePiece } from './spice';
import { spiceBlowOf } from './spiceBlow';
import type { SpiceBlow } from './spiceBlow';
import { revealedSpiceBlows } from './spiceBlowPlacement';
import { spiceBlowPins, spiceBlowSpot } from './spiceBlowSpot';
import { SPICE_TOKEN_ID } from './spiceToken';

const brokenLand: SpiceBlow = { amount: 8, territories: ['broken_land'] };

/* A revealed Broken Land card lying off the board, beside where the spice deck sits. */
function spiceCardItem(id: string, faceUp: boolean, name: string, spiceBlow: SpiceBlow): TableItem {
  return {
    id,
    faceUp,
    artwork: { back: 'https://example.test/back.jpg', name, type: 'card-spice', spiceBlow },
  };
}

function revealedCard(
  faceUp = true,
  items = [spiceCardItem('blow-card-1', faceUp, 'Broken Land', brokenLand)]
): TablePiece {
  return {
    id: 'blow-card',
    label: '',
    owner: 'shared',
    color: '#d5ba8c',
    accent: '#ead9bb',
    kind: 'card',
    stackKey: 'deck:spice',
    items,
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
    { board: arrakisBoardCapture },
    state.pieces,
    state.pieces.find((piece) => piece.id === 'blow-card')!
  );
  if (!spot) {
    throw new Error('No spot');
  }
  return applyPieceAction(state, { kind: 'spice-blow', ...spot }, phase, 'Alice', STANDARD_PHASES);
};

describe('spice blow capture', () => {
  test('a card without a board names no territory', () => {
    expect(spiceBlowOf('card-spice', { highlights: ['broken-land'], amount: 8 })).toBeUndefined();
  });

  test('a linked board names the territory its map shows, not the classic highlights it no longer draws', () => {
    const blow = spiceBlowOf('card-spice', {
      highlights: ['broken-land'],
      amount: 6,
      board: {
        asset_id: 'arrakis-board',
        tints: [{ territories: ['arsunt'] }],
        tokens: [],
      },
    });
    expect(blow).toEqual({ amount: 6, territories: ['arsunt'], boardId: 'arrakis-board' });
  });

  test('a linked board that only outlines names its outline, and a token off the frame is left out', () => {
    const blow = spiceBlowOf('card-spice', {
      highlights: ['broken-land'],
      amount: 6,
      board: {
        asset_id: 'arrakis-board',
        tints: [{ territories: ['arsunt'], outline: true }],
        tokens: [
          { x: 489.2, y: 300 },
          { x: 150, y: 370 },
        ],
      },
    });
    expect(blow).toEqual({ amount: 6, territories: ['arsunt'], spots: [[150, 370]], boardId: 'arrakis-board' });
  });

  test('without a spice stamp, a card that also marks a token territory places its spice in the first territory it marks', () => {
    const blow = spiceBlowOf('card-spice', {
      amount: 6,
      board: {
        asset_id: 'arrakis-board',
        tints: [{ territories: ['sihaya_ridge'] }, { territories: ['cielago_east'] }],
        tokens: [],
      },
    });
    expect(blow).toEqual({ amount: 6, territories: ['sihaya_ridge'], boardId: 'arrakis-board' });
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

describe('spice blow spots', () => {
  test("a card's spice tokens mark its spots, and another token on its map does not", () => {
    const blow = spiceBlowOf('card-spice', {
      amount: 6,
      board: {
        asset_id: 'arrakis-board',
        tints: [{ territories: ['broken_land'], stamps: ['spice'] }],
        tokens: [
          { asset_id: 'a-discovery-token', x: 120, y: 40 },
          { asset_id: SPICE_TOKEN_ID, x: 158, y: 31 },
        ],
      },
    });
    expect(blow?.spots).toEqual([[158, 31]]);
  });

  test('a map without the spice token offers every token it placed', () => {
    const blow = spiceBlowOf('card-spice', {
      amount: 3,
      board: {
        asset_id: 'arrakis-board',
        tints: [{ territories: ['arsunt'] }],
        tokens: [{ asset_id: 'mine', x: 80, y: 200 }],
      },
    });
    expect(blow?.spots).toEqual([[80, 200]]);
  });
});

describe('placing a revealed spice card', () => {
  test("puts the card's spice in a free spot inside its territory, and again onto that spice", () => {
    const state = tableWithCard();
    const spot = spiceBlowSpot({ board: arrakisBoardCapture }, state.pieces, state.pieces.at(-1)!)!;
    expect(spot.name).toBe(boardTerritory(arrakisBoardCapture.definition, 'broken_land')!.name);
    expect(tableTerritoryAt(arrakisBoardCapture.definition, spot.position[0], spot.position[2])?.id).toBe(
      'broken_land'
    );
    expect(revealedSpiceBlows(state.pieces)).toEqual([{ pieceId: 'blow-card', blow: brokenLand }]);
    /* The spice lands on the spice sticker the table lights Broken Land with. */
    const { rings } = boardTerritory(arrakisBoardCapture.definition, 'broken_land')!;
    const [sticker] = placeStickers(
      rings.map((ring) => ring.map(boardPointToTable)),
      1,
      TABLE_STICKER_LARGEST
    ).at;
    expect(spot.position[0]).toBeCloseTo(sticker![0], 2);
    expect(spot.position[2]).toBeCloseTo(sticker![1], 2);

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

  test("lands exactly on the spot the card's own map marks, and the board pins its spice sticker there", () => {
    const board = arrakisBoardCapture.definition;
    const { centre, rings } = boardTerritory(board, 'broken_land')!;
    const corner = rings[0]!.find(([x, y]) => {
      const [tx, tz] = boardPointToTable([centre[0] + (x - centre[0]) * 0.7, centre[1] + (y - centre[1]) * 0.7]);
      return tableTerritoryAt(board, tx, tz)?.id === 'broken_land';
    })!;
    const mark: [number, number] = [
      centre[0] + (corner[0] - centre[0]) * 0.7,
      centre[1] + (corner[1] - centre[1]) * 0.7,
    ];
    /* A second token in another territory, as a Discovery card's destination, is no spot for the spice. */
    const elsewhere = boardTerritory(board, 'arsunt')!.centre;
    const blow: SpiceBlow = { ...brokenLand, spots: [elsewhere, mark], boardId: arrakisBoardCapture.asset.id };
    const state = freshTableState();
    const card = revealedCard(true, [spiceCardItem('blow-card-1', true, 'Broken Land', blow)]);
    const pieces = [...state.pieces, card];
    const [x, z] = boardPointToTable(mark);

    const spot = spiceBlowSpot({ board: arrakisBoardCapture }, pieces, card)!;
    expect(spot.position[0]).toBeCloseTo(x, 6);
    expect(spot.position[2]).toBeCloseTo(z, 6);
    expect(spiceBlowPins({ board: arrakisBoardCapture }, pieces)).toEqual([{ territory: 'broken_land', at: [x, z] }]);

    /* On another board the card's spots mean nothing: no pin, and the spice goes where the table lights it. */
    const otherBoard = { ...arrakisBoardCapture, asset: { ...arrakisBoardCapture.asset, id: 'another-board' } };
    expect(spiceBlowPins({ board: otherBoard }, pieces)).toEqual([]);
    expect(spiceBlowSpot({ board: otherBoard }, pieces, card)!.position[0]).not.toBeCloseTo(x, 6);
  });

  test('in a pile, only the face-up card on top counts, never the cards underneath', () => {
    const arsunt = spiceBlowOf('card-spice', { highlights: ['arsunt'], amount: 6 })!;
    const under = spiceCardItem('blow-card-0', true, 'Arsunt', arsunt);
    const top = (faceUp: boolean) => spiceCardItem('blow-card-1', faceUp, 'Broken Land', brokenLand);
    const covered = revealedCard(true, [under, top(true)]);
    expect(revealedSpiceBlows([covered])).toEqual([{ pieceId: 'blow-card', blow: brokenLand }]);
    const turnedDown = revealedCard(false, [under, top(false)]);
    expect(revealedSpiceBlows([turnedDown])).toEqual([]);
    const state = freshTableState();
    expect(() =>
      applyPieceAction(
        { ...state, pieces: [...state.pieces, covered] },
        { kind: 'spice-blow', pieceId: 'blow-card', territory: 'arsunt', name: 'Arsunt', position: [0, 0, 0] },
        1
      )
    ).toThrow(GameRejection);
  });

  test('a spot taken since the page chose it is refused, never moved past the territory', () => {
    const state = tableWithCard();
    const spot = spiceBlowSpot({ board: arrakisBoardCapture }, state.pieces, state.pieces.at(-1)!)!;
    const blocker = state.pieces.find((piece) => piece.kind === 'force' && !piece.inventory && !piece.locked)!;
    const taken: TableState = {
      ...state,
      pieces: state.pieces.map((piece) =>
        piece === blocker ? { ...piece, position: [spot.position[0], piece.position[1], spot.position[2]] } : piece
      ),
    };
    expect(() => applyPieceAction(taken, { kind: 'spice-blow', ...spot }, 1, 'Alice', STANDARD_PHASES)).toThrow(
      /place the spice again/
    );
  });

  test('a pile someone is carrying is no pile to join', () => {
    const state = place(tableWithCard());
    const carried = state.pieces.map((piece) => (isSpicePiece(piece) ? { ...piece, locked: true } : piece));
    const spot = spiceBlowSpot(
      { board: arrakisBoardCapture },
      carried,
      carried.find((piece) => piece.id === 'blow-card')!
    )!;
    const pile = carried.find(isSpicePiece)!;
    expect(spot.position).not.toEqual(pile.position);
    expect(tableTerritoryAt(arrakisBoardCapture.definition, spot.position[0], spot.position[2])?.id).toBe(
      'broken_land'
    );
  });

  test('a face-down card or another territory is refused', () => {
    const hidden = tableWithCard(false);
    expect(spiceBlowSpot({ board: arrakisBoardCapture }, hidden.pieces, hidden.pieces.at(-1)!)).toBeNull();
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
