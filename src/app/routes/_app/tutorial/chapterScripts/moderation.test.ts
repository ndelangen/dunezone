import type { GameSnapshot } from '@shared/play/protocol';
import { expect, test, vi } from 'vite-plus/test';

import type { TablePlayers } from './chapterScript';
import { moderation } from './moderation';

test('a replacement review must still select Storm before the others agree', () => {
  vi.useFakeTimers();
  const review = {
    id: 'review-1',
    step: 1,
    startedAt: null as number | null,
    ballots: [{ seat: 'other', choice: null }],
  };
  const snapshot = () => ({ review, controls: { players: [] } }) as unknown as GameSnapshot;
  const act = vi.fn();
  const players = { others: () => ['other'], act } as unknown as TablePlayers;
  const task = moderation.tasks(snapshot, players).find((task) => task.id === 'review-votes')!;
  const watch = task.begin(undefined as never);
  try {
    vi.advanceTimersByTime(1500);
    expect(act).not.toHaveBeenCalled();
    review.startedAt = 1;
    expect(task.done(watch, undefined as never)).toBe(false);
    review.startedAt = null;
    review.step = 0;
    vi.advanceTimersByTime(1500);
    expect(act).toHaveBeenCalledWith('other', {
      kind: 'review-ballot',
      reviewId: 'review-1',
      choice: 'review',
    });
    review.startedAt = 1;
    expect(task.done(watch, undefined as never)).toBe(true);
  } finally {
    task.finish?.(watch);
    vi.useRealTimers();
  }
});
