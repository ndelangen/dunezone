import type { GameSnapshot } from '@shared/play/protocol';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import type { TablePlayers } from './chapterScript';
import { draftAndTrade, keepOthersReady } from './draftAndTrade';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/* After the deal the table refuses draft-ready, so the others stop asking once drafting has ended. */
test('the others stop readying up once the draft has ended', () => {
  let view = { stage: 'drafting', draft: { ready: ['seat-2'] } } as unknown as GameSnapshot;
  const act = vi.fn();
  const players: TablePlayers = {
    act,
    viewOf: () => view,
    others: () => ['seat-2', 'seat-3'],
    landings: () => [],
    captured: () => undefined,
  };
  const stop = keepOthersReady(() => view, players);
  expect(act).toHaveBeenCalledExactlyOnceWith('seat-3', { kind: 'draft-ready', ready: true });
  view = { stage: 'swapping' } as unknown as GameSnapshot;
  vi.advanceTimersByTime(2000);
  expect(act).toHaveBeenCalledOnce();
  stop();
});

/* A learner who drafts or bans more than asked is dealt at random, so the trade steps name what the table dealt. */
test('the trade steps name the faction the learner was dealt and a player who is at the table', () => {
  const seat = (id: string, name: string) => ({ id, faction: { name } });
  const view = {
    stage: 'swapping',
    roster: { seats: [seat('seat-1', 'Fremen'), seat('seat-2', 'Emperor'), seat('seat-3', 'Spacing Guild')] },
  } as unknown as GameSnapshot;
  const players: TablePlayers = {
    act: vi.fn(),
    viewOf: () => view,
    others: () => [],
    landings: () => [],
    captured: () => undefined,
  };
  const steps = draftAndTrade.tasks(() => view, players);
  const detail = (id: string) => steps.find((step) => step.id === id)!.detail;
  expect(detail('dealt')).toContain('Fremen');
  expect(detail('offer')).toMatch(/^Click the Emperor token/);
  expect(detail('cancel')).toContain('keep Fremen');
});
