import type { GameSnapshot } from '@shared/play/protocol';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import type { TablePlayers } from './chapterScript';
import { keepOthersReady } from './draftAndTrade';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/* After the deal the table refuses draft-ready, so the others stop asking once drafting has ended. */
test('the others stop readying up once the draft has ended', () => {
  let view = { stage: 'drafting', draft: { ready: ['seat-2'] } } as unknown as GameSnapshot;
  const act = vi.fn();
  const players: TablePlayers = { act, viewOf: () => view, others: () => ['seat-2', 'seat-3'] };
  const stop = keepOthersReady(() => view, players);
  expect(act).toHaveBeenCalledExactlyOnceWith('seat-3', { kind: 'draft-ready', ready: true });
  view = { stage: 'swapping' } as unknown as GameSnapshot;
  vi.advanceTimersByTime(2000);
  expect(act).toHaveBeenCalledOnce();
  stop();
});
