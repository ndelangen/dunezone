import { expect, test } from 'vitest';

import { hostedFixturePlan } from './fixture';
import { dealPredictionCard, revealPlacedPredictions } from './predictionCards';
import type { StoredSnapshot } from './state';
import { RoomProjection } from './state';

const FACES = {
  front: 'https://table.test/published/cards/prediction/card.jpg',
  back: 'https://table.test/published/cardback-presets/prediction/cardback.jpg',
};

function locked(faces: StoredSnapshot['predictionFaces'] = { atreides: FACES }): StoredSnapshot {
  const fixture = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  return {
    ...fixture,
    predictionFaces: faces,
    factionInventories: { atreides: [] },
    privatePredictions: {
      'faction-step-1': {
        factionId: 'atreides',
        choice: { factionId: 'harkonnen', turn: 4 },
        lockedAt: 1,
        revealedAt: null,
      },
    },
  };
}

test('a locked prediction deals its card into the hand on the shared base and the Prediction back', () => {
  const dealt = dealPredictionCard(locked(), 'faction-step-1');
  const [card] = dealt.factionInventories.atreides!;
  expect(card).toMatchObject({ label: 'Prediction', kind: 'card', owner: 'atreides' });
  expect(card!.items[0]!.artwork).toEqual({
    ...FACES,
    backName: 'Prediction',
    name: 'Prediction',
    type: 'card-prediction',
    prediction: { stepId: 'faction-step-1', factionId: 'harkonnen', turn: 4 },
  });
});

test('a game that captured no prediction faces deals no card', () => {
  expect(dealPredictionCard(locked({}), 'faction-step-1').factionInventories.atreides).toEqual([]);
});

test('another seat sees a prediction card in a hand or face down only by its back', () => {
  const card = dealPredictionCard(locked(), 'faction-step-1').factionInventories.atreides![0]!;
  const projection = new RoomProjection('secret');
  expect(
    projection.piece({ ...card, items: card.items.map((item) => ({ ...item, faceUp: false })) }).items[0]!.artwork
  ).toEqual({
    back: FACES.back,
    backName: 'Prediction',
  });
  expect(projection.piece(card, true).items[0]!.artwork?.prediction).toEqual({
    stepId: 'faction-step-1',
    factionId: 'harkonnen',
    turn: 4,
  });
});

test('placing the card on the table reveals its prediction once and lays it face down', () => {
  const dealt = dealPredictionCard(locked(), 'faction-step-1');
  const card = dealt.factionInventories.atreides![0]!;
  const placed: StoredSnapshot = {
    ...dealt,
    factionInventories: { atreides: [] },
    table: { ...dealt.table, pieces: [...dealt.table.pieces, card] },
  };
  const revealed = revealPlacedPredictions(placed, 50);
  expect(revealed.privatePredictions['faction-step-1']!.revealedAt).toBe(50);
  expect(revealed.table.pieces.at(-1)!.items.every((item) => !item.faceUp)).toBe(true);
  /* Turning it over later keeps the first reveal. */
  const flipped = {
    ...revealed,
    table: {
      ...revealed.table,
      pieces: revealed.table.pieces.map((piece) =>
        piece.id === card.id ? { ...piece, items: piece.items.map((item) => ({ ...item, faceUp: true })) } : piece
      ),
    },
  };
  expect(revealPlacedPredictions(flipped, 90)).toBe(flipped);
});

test('a card still in the hand reveals nothing', () => {
  const dealt = dealPredictionCard(locked(), 'faction-step-1');
  expect(revealPlacedPredictions(dealt, 50)).toBe(dealt);
});
