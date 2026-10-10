import { describe, expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import { NOTHING_TO_UNDO, UNDO_CROSSED } from '../../src/shared/play/undo';
import { Room } from './room';

const identity = (name: string, viewerSeat: string) => ({
  connectionId: `${name}-connection`,
  userId: `${name}-user`,
  viewerSeat,
  displayName: name,
  color: '#ed927c',
});
const alice = identity('alice', 'harkonnen');
const bob = identity('bob', 'atreides');
const SOURCE = 'harkonnen-force-stack';
const LATER = Date.now() + 10 * PHASE_CHANGE_COOLDOWN_MS;

function room() {
  return new Room(initialSnapshot(), () => [alice.viewerSeat, bob.viewerSeat]);
}

/* Carries the whole Harkonnen stack to the middle of the board and drops it there. */
function move(table: Room, actor = alice, carryId = 'move') {
  table.begin(actor, {
    carryId,
    sourcePieceId: SOURCE,
    expectedVersion: table.snapshot.versions[SOURCE],
    pickup: 'whole',
  });
  table.accept(table.drop(actor, carryId, [0, 0.38, 0], 0), carryId);
}

const undo = (table: Room, actor = alice) => table.command(actor, { kind: 'undo' }, table.snapshot.revision);
const pieces = (table: Room) => table.snapshot.table.pieces;

describe('undoing your own last move', () => {
  test('puts a dropped stack back exactly where it was, and says so in the log', () => {
    const table = room();
    const before = pieces(table);
    move(table);
    expect(pieces(table)).not.toEqual(before);
    table.accept(undo(table));
    expect(pieces(table)).toEqual(before);
    expect(table.snapshot.table.events[0].message).toBe('Harkonnen undid their last move.');
  });

  test('takes back a flip, and only once', () => {
    const table = room();
    const before = pieces(table);
    table.accept(table.command(alice, { kind: 'flip', pieceId: SOURCE }, table.snapshot.revision));
    table.accept(undo(table));
    expect(pieces(table)).toEqual(before);
    expect(() => undo(table)).toThrow(NOTHING_TO_UNDO);
  });

  test('has nothing to undo for a player who has not moved, or for another player’s move', () => {
    const table = room();
    expect(() => undo(table)).toThrow(NOTHING_TO_UNDO);
    move(table);
    expect(() => undo(table, bob)).toThrow(NOTHING_TO_UNDO);
  });

  test('refuses once anybody has changed the table since', () => {
    const table = room();
    move(table);
    table.accept(table.command(bob, { kind: 'flip', pieceId: 'atreides-force-stack' }, table.snapshot.revision));
    expect(() => undo(table)).toThrow(UNDO_CROSSED);
  });

  test('refuses after the phase has moved on', () => {
    const table = room();
    move(table);
    table.accept(table.command(bob, { kind: 'phase' }, table.snapshot.revision, LATER));
    expect(() => undo(table)).toThrow(UNDO_CROSSED);
  });

  test('keeps only the latest move: an earlier one cannot be undone after a later one', () => {
    const table = room();
    move(table);
    const afterMove = pieces(table);
    table.accept(table.command(alice, { kind: 'rotate', pieceId: SOURCE, direction: 1 }, table.snapshot.revision));
    table.accept(undo(table));
    expect(pieces(table)).toEqual(afterMove);
    expect(() => undo(table)).toThrow(NOTHING_TO_UNDO);
  });

  test('a move the room never accepted is not remembered', () => {
    const table = room();
    table.begin(alice, { carryId: 'lost', sourcePieceId: SOURCE, expectedVersion: 0, pickup: 'whole' });
    table.drop(alice, 'lost', [0, 0.38, 0], 0);
    table.cancel(alice, 'lost');
    table.accept(table.command(bob, { kind: 'flip', pieceId: 'atreides-force-stack' }, table.snapshot.revision));
    expect(() => undo(table)).toThrow(NOTHING_TO_UNDO);
    expect(() => undo(table, bob)).not.toThrow();
  });
});
