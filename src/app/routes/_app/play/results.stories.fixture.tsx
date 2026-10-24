import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';

import { withPredictionCard } from './game.stories.fixture';
import { playingSnapshot, SIX } from './product.stories.fixture';

const MENTAT_PAUSE = 8;
export const factionOf = (snapshot: GameSnapshot, index: number) => snapshot.roster!.seats[index]!.faction!;

/* Turn 1 Mentat Pause with every seat filled; the viewer's own faction holds a locked prediction if asked. */
export function mentatSnapshot(viewerSeat: string, { prediction = false, card = false } = {}): GameSnapshot {
  const snapshot = playingSnapshot(viewerSeat === SPECTATOR_SEAT ? 'seat-2' : viewerSeat);
  snapshot.phase = MENTAT_PAUSE;
  snapshot.controls!.seats = SIX.map((player) => player.seat);
  if (prediction) {
    snapshot.predictions = {
      prediction: { factionId: factionOf(snapshot, 1).id, lockedAt: 1, revealedAt: null },
    };
  }
  if (prediction && card) {
    withPredictionCard(snapshot, factionOf(snapshot, 1).id, factionOf(snapshot, 0).id);
  }
  return snapshot;
}

export function finishedSnapshot(viewerSeat: string, declaredAt = 1): GameSnapshot {
  const snapshot = mentatSnapshot(viewerSeat);
  snapshot.stage = 'finished';
  snapshot.result = {
    kind: 'alliance',
    factionIds: [factionOf(snapshot, 0).id, factionOf(snapshot, 2).id],
    by: { seat: 'seat-1', name: SIX[0]!.name },
    declaredAt,
  };
  return snapshot;
}
