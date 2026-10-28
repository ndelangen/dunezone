import type { PieceAction } from '@shared/play/protocol';
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from './localTable';

let table: LocalTable;
let command = 0;
const act = (action: PieceAction, seat = table.seat) =>
  table.receive(
    { type: 'command', commandId: `review-${++command}`, expectedRevision: table.room.snapshot.revision, action },
    seat
  );
const view = () => table.frame().snapshot;
const agree = () => {
  for (const seat of table.seats().filter((seat) => seat !== table.seat)) {
    const review = view().review;
    if (review?.startedAt === null) {
      act({ kind: 'review-ballot', reviewId: review.id, choice: 'review' }, seat);
    }
  }
};
beforeEach(() => {
  table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
});
afterEach(() => table.dispose());

test('a majority reviews a saved public position, freezes play and resumes the unchanged current table', () => {
  const storm = view().phase;
  act({ kind: 'phase' });
  const live = table.room.snapshot;
  expect(view().reviewCheckpoints).toHaveLength(2);
  expect(() => table.history(0)).toThrow('Replay opens once the game is finished.');
  act({ kind: 'review-propose', step: 0 });
  expect(view().review?.startedAt).toBeNull();
  expect(() => table.history(0)).toThrow();
  agree();
  expect(view().review?.startedAt).toEqual(expect.any(Number));
  const past = table.history(0).snapshot;
  expect(past.phase).toBe(storm);
  expect(past.hand ?? []).toHaveLength(0);
  expect(past.bank).toBeUndefined();
  expect(past.battlePlan).toBeNull();
  expect(() => table.history(1)).toThrow();
  act({ kind: 'phase' });
  expect(table.refusal).toBe('The table is paused for a review.');
  expect(view().phase).toBe(live.phase);
  act({ kind: 'review-end', reviewId: view().review!.id });
  expect(view().review).toBeNull();
  expect(table.room.snapshot.table).toEqual(live.table);
  expect(table.room.snapshot.phase).toBe(live.phase);
  expect(() => table.history(0)).toThrow();
  const audit = table
    .logPage('audit', Number.MAX_SAFE_INTEGER)
    .entries.map((entry) => entry.text)
    .join('\n');
  expect(audit).toMatch(/recall/i);
  expect(audit).toMatch(/resumed/i);
});

test('a finished game replays distinct phases and closes replay when continued', () => {
  const initial = view().phase;
  for (let i = 0; i < 8; i++) {
    act({ kind: 'phase' });
  }
  act({ kind: 'result-open' });
  act({ kind: 'result-declare', result: 'none', factionIds: [] });
  expect(view().stage).toBe('finished');
  expect(table.history(0).snapshot.phase).toBe(initial);
  expect(table.history(1).snapshot.phase).not.toBe(initial);
  expect(table.history(0).lastStep).toBeGreaterThan(8);
  expect(table.history(0).snapshot.hand ?? []).toHaveLength(0);
  act({ kind: 'result-continue' });
  expect(() => table.history(0)).toThrow('Replay opens once the game is finished.');
});

test('a departed proposer withdraws a pending review and records the outcome', () => {
  const proposer = table.seats().find((seat) => seat !== table.seat)!;
  act({ kind: 'review-propose', step: 0 }, proposer);
  act({ kind: 'seat-depart' }, proposer);
  expect(view().review).toBeNull();
  expect(
    table
      .logPage('audit', Number.MAX_SAFE_INTEGER)
      .entries.some((entry) => /recall.*withdraw|withdrew.*recall/i.test(entry.text))
  ).toBe(true);
});
