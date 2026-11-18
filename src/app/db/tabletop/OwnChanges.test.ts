import type { GameSnapshot, PieceAction } from '@shared/play/protocol';
import { expect, test } from 'vite-plus/test';

import { OwnChanges, ownChangesBetween } from './OwnChanges';

const room = (revision: number, table: Readonly<{ order?: string[]; sides?: (string | null)[] }>) =>
  ({
    revision,
    movement: { order: table.order ?? [], done: [] },
    battle: { id: 'b1', sides: (table.sides ?? []).map((factionId) => (factionId ? { factionId } : null)) },
  }) as unknown as GameSnapshot;
const order = ['harkonnen', 'atreides'];
const reorder = { kind: 'movement-order', order } as unknown as PieceAction;
const claim = { kind: 'battle-claim', battleId: 'b1', side: 1 } as unknown as PieceAction;

test('a reorder counts as the viewer’s own at the revision that showed it, and not once refused', () => {
  const changes = new OwnChanges();
  changes.sent('a', reorder);
  expect(changes.view().changes).toEqual([]);
  changes.settled('a', 'completed', { room: room(2, { order }), followsLater: false });
  expect(changes.view().changes).toEqual([{ kind: 'movement-order', order, revision: 2 }]);
  const refused = new OwnChanges();
  refused.sent('b', reorder);
  refused.settled('b', 'rejected', { room: room(2, { order }), followsLater: false });
  expect(refused.view().changes).toEqual([]);
});

test('an old accepted order is outside a later step that lands on the same order', () => {
  const changes = new OwnChanges();
  changes.sent('a', reorder);
  changes.settled('a', 'completed', { room: room(2, { order }), followsLater: false });
  const mine = changes.view().changes;
  expect(ownChangesBetween(mine, { revision: 1 }, { revision: 2 })).toHaveLength(1);
  expect(ownChangesBetween(mine, { revision: 3 }, { revision: 4 })).toEqual([]);
});

test('after a resync the receipt waits for the replacement table', () => {
  const changes = new OwnChanges();
  changes.sent('a', reorder);
  changes.settled('a', 'completed', { room: room(1, {}), followsLater: true });
  expect(changes.view().changes).toEqual([]);
  changes.observed(room(3, { order }));
  expect(changes.view().changes).toEqual([{ kind: 'movement-order', order, revision: 3 }]);
});

test('a claim counts only when the room shows it completed the battle, even one sent from a stale table', () => {
  const first = new OwnChanges();
  first.sent('first', claim);
  first.settled('first', 'completed', { room: room(2, { sides: [null, 'harkonnen'] }), followsLater: false });
  expect(first.view().changes).toEqual([]);
  const raced = new OwnChanges();
  raced.sent('last', claim);
  raced.settled('last', 'completed', { room: room(3, { sides: ['atreides', 'harkonnen'] }), followsLater: false });
  expect(raced.view().changes).toEqual([{ kind: 'battle-completed', battleId: 'b1', revision: 3 }]);
  raced.forget();
  expect(raced.view()).toEqual({ changes: [] });
});

test('the view stays the same object until something changes', () => {
  const changes = new OwnChanges();
  const view = changes.view();
  changes.settled('unknown', 'completed', { room: room(2, {}), followsLater: false });
  expect(changes.view()).toBe(view);
});
