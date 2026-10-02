import { cardbackPresetLabel } from '../../src/shared/assets/cardbackPresets';
import type { StoredPiece } from '../../src/shared/play/model';
import type { StoredSnapshot } from './state';

type Prediction = StoredSnapshot['privatePredictions'][string];

/** The card a locked prediction puts in its faction's hand: the shared base, with the choice drawn over it by every client (#1753). */
function predictionCard(
  stepId: string,
  prediction: Prediction,
  faces: StoredSnapshot['predictionFaces'][string]
): StoredPiece {
  const label = cardbackPresetLabel('prediction');
  return {
    id: `prediction-${stepId}`,
    label,
    owner: prediction.factionId,
    color: '#d5ba8c',
    accent: '#ead9bb',
    kind: 'card',
    stackKey: `prediction:${stepId}`,
    items: [
      {
        id: `prediction-${stepId}-card`,
        faceUp: true,
        artwork: {
          ...(faces.front ? { front: faces.front } : {}),
          back: faces.back,
          backName: label,
          name: label,
          type: 'card-prediction',
          prediction: { stepId, factionId: prediction.choice.factionId, turn: prediction.choice.turn },
        },
      },
    ],
    position: [-25, 0, -25],
    orientation: 0,
    zoneId: null,
    locked: false,
  };
}

/** A locked prediction with its card in the faction's hand, when the game captured the faces to deal it with. */
export function dealPredictionCard(snapshot: StoredSnapshot, stepId: string): StoredSnapshot {
  const prediction = snapshot.privatePredictions[stepId];
  const faces = prediction && snapshot.predictionFaces[prediction.factionId];
  if (!prediction || !faces) {
    return snapshot;
  }
  const hand = snapshot.factionInventories[prediction.factionId] ?? [];
  return {
    ...snapshot,
    factionInventories: {
      ...snapshot.factionInventories,
      [prediction.factionId]: [...hand, predictionCard(stepId, prediction, faces)],
    },
  };
}

/** The unrevealed predictions whose cards lie in a piece on the table. */
function unrevealedIn(snapshot: StoredSnapshot, piece: StoredPiece): string[] {
  return piece.items.flatMap((item) => {
    const stepId = item.artwork?.prediction?.stepId;
    return stepId && snapshot.privatePredictions[stepId]?.revealedAt === null ? [stepId] : [];
  });
}

/**
 * Placing a prediction card on the table reveals its prediction, however it got there (#1753).
 * The card itself lands face down, so turning it over stays its own moment.
 */
export function revealPlacedPredictions(snapshot: StoredSnapshot, now: number): StoredSnapshot {
  const placed = new Set(snapshot.table.pieces.flatMap((piece) => unrevealedIn(snapshot, piece)));
  if (!placed.size) {
    return snapshot;
  }
  const pieces = snapshot.table.pieces.map((piece) =>
    unrevealedIn(snapshot, piece).length
      ? { ...piece, items: piece.items.map((item) => ({ ...item, faceUp: false })) }
      : piece
  );
  const privatePredictions = { ...snapshot.privatePredictions };
  for (const stepId of placed) {
    privatePredictions[stepId] = { ...privatePredictions[stepId]!, revealedAt: now };
  }
  return { ...snapshot, table: { ...snapshot.table, pieces }, privatePredictions };
}
