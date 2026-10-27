import type { GameSnapshot } from '@shared/play/protocol';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import type { TablePlayers } from './chapterScript';
import { moderation } from './moderation';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const FACTIONS = ['House Harkonnen', 'Fremen', 'Emperor', 'House Atreides', 'Spacing Guild'];
const seats = FACTIONS.map((name, index) => ({ id: `seat-${index + 2}`, faction: { name } }));
const ballots = () => seats.slice(1).map((seat) => ({ seat: seat.id, choice: null }));

/* A learner who turns their ballot to Keep can sink the vote; the vote they start next still gets the others' ballots. */
test('the others vote on a second vote after the first one fails', () => {
  let view = {
    roster: { seats },
    removalVotes: [{ id: 'vote-1', target: { seat: 'seat-2' }, ballots: ballots() }],
  } as unknown as GameSnapshot;
  const act = vi.fn();
  const players: TablePlayers = { act, viewOf: () => view, others: () => [], landings: () => [] };
  const votes = moderation.tasks(() => view, players).find((step) => step.id === 'votes')!;
  const stop = votes.begin(undefined as never) as () => void;
  vi.advanceTimersByTime(1500);
  expect(act).toHaveBeenLastCalledWith('seat-3', { kind: 'removal-ballot', voteId: 'vote-1', choice: 'remove' });
  view = { roster: { seats }, removalVotes: [] } as unknown as GameSnapshot;
  vi.advanceTimersByTime(3000);
  expect(act).toHaveBeenCalledOnce();
  view = {
    roster: { seats },
    removalVotes: [{ id: 'vote-2', target: { seat: 'seat-2' }, ballots: ballots() }],
  } as unknown as GameSnapshot;
  vi.advanceTimersByTime(1500);
  expect(act).toHaveBeenLastCalledWith('seat-3', { kind: 'removal-ballot', voteId: 'vote-2', choice: 'remove' });
  stop();
});
