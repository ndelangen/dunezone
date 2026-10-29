import type { PieceAction } from '@shared/play/protocol';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalTable } from './localTable';

let table: LocalTable;
let sequence = 0;
const command = (action: PieceAction, seat = table.seat) =>
  table.receive(
    {
      type: 'command',
      commandId: `evidence-${++sequence}`,
      action,
      expectedRevision: table.room.snapshot.revision,
    },
    seat
  );

beforeEach(() => {
  table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
});
afterEach(() => {
  table.dispose();
  vi.useRealTimers();
});

test('records successful learner commands with their source before it changes', () => {
  const deck = table
    .frame()
    .snapshot.table.pieces.find((piece) => piece.stackKey?.startsWith('deck:') && piece.position[0] < 0)!;
  command({ kind: 'deck-draw', pieceId: deck.id });
  const entry = table.acceptedActions()[0]!;
  expect(entry.action).toEqual({ kind: 'deck-draw', pieceId: deck.id });
  expect(entry.source?.items).toHaveLength(deck.items.length);
  expect(table.frame().snapshot.table.pieces.find((piece) => piece.id === deck.id)?.items).toHaveLength(
    deck.items.length - 1
  );
  command({ kind: 'delete', pieceId: 'missing-piece' });
  command(
    { kind: 'storm-random' },
    table.seats().find((seat) => seat !== table.seat)!
  );
  expect(table.acceptedActions()).toHaveLength(1);
});

test('records table ping messages from the learner only', () => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  const message = { type: 'ping' as const, position: [0, 0, 0] as [number, number, number] };
  table.receive(
    message,
    table.seats().find((seat) => seat !== table.seat)!
  );
  expect(table.pings()).toEqual([]);
  table.receive(message);
  vi.advanceTimersByTime(500);
  table.receive(message);
  expect(table.pings()).toEqual([10_000, 10_500]);
});
