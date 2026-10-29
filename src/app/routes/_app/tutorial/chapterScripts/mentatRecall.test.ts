import type { GameSnapshot } from '@shared/play/protocol';
import { expect, test, vi } from 'vite-plus/test';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from '../table/localTable';
import type { TablePlayers } from './chapterScript';
import { mentatRecall } from './mentatRecall';

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
  const task = mentatRecall.tasks(snapshot, players).find((task) => task.id === 'review-votes')!;
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

const recordedTracker = (table: LocalTable, step: number) =>
  table.history(step).snapshot.hand?.find((piece) => piece.label === 'Kwisatz Haderach')?.hiddenZone;

test('the chapter records its private tracker before Storm and returns to the unchanged live phase', () => {
  const table = new LocalTable(
    startAt(setup as unknown as TutorialSetup, mentatRecall.checkpoint, 'https://dune.zone', mentatRecall)
  );
  let command = 0;
  const players: TablePlayers = {
    act: (seat, action) =>
      table.receive(
        { type: 'command', commandId: `lesson-${++command}`, expectedRevision: table.room.snapshot.revision, action },
        seat
      ),
    viewOf: (seat) => table.frame(seat).snapshot,
    others: () => table.seats().filter((seat) => seat !== table.seat),
    landings: () => table.landings(),
    captured: () => undefined,
    capturedPieces: () => [],
  };
  const view = () => table.frame().snapshot;
  try {
    mentatRecall.opening?.(players);
    const live = view().phase;
    players.act(table.seat, { kind: 'review-propose', step: 0 });
    for (const seat of players.others()) {
      if (view().review?.startedAt === null) {
        players.act(seat, { kind: 'review-ballot', reviewId: view().review!.id, choice: 'review' });
      }
    }
    const past = table.history(0).snapshot;
    expect(past.phase).not.toBe(live);
    expect(recordedTracker(table, 0)).toEqual({ x: 0.5, y: 0.5 });
    players.act(table.seat, { kind: 'review-seek', reviewId: view().review!.id, step: 1 });
    expect(recordedTracker(table, 1)).toEqual({
      x: 0.5,
      y: 0.5,
    });
    players.act(table.seat, { kind: 'review-end', reviewId: view().review!.id });
    expect(view().review).toBeNull();
    expect(view().phase).toBe(live);
  } finally {
    table.dispose();
  }
});
