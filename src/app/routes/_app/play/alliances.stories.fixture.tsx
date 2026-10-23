import type { GameSnapshot } from '@shared/play/protocol';
import { rosterSeat } from '@shared/play/schema';

import { STORYBOOK_NOW } from '@db/storybook';

import { playingSnapshot } from './product.stories.fixture';

export const VIEWER = 'seat-2';
export const faction = (snapshot: GameSnapshot, seat: string) => rosterSeat(snapshot.roster, seat)!.faction!.id;

/* Seats 4 and 5 are allied, and seat 1 has offered the viewer an alliance. */
export function alliancesSnapshot(): GameSnapshot {
  const snapshot = playingSnapshot(VIEWER);
  snapshot.alliances = {
    groups: [{ members: [faction(snapshot, 'seat-4'), faction(snapshot, 'seat-5')], mark: 0 }],
    offers: [{ from: faction(snapshot, 'seat-1'), to: faction(snapshot, VIEWER), at: STORYBOOK_NOW, id: 0 }],
  };
  return snapshot;
}
