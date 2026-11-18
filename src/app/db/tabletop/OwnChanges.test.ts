import type { GameSnapshot, PieceAction } from '@shared/play/protocol';
import { expect, test } from 'vite-plus/test';

import { OwnChanges } from './OwnChanges';

const room = (sides: (string | null)[]) =>
  ({
    battle: { id: 'b1', sides: sides.map((factionId) => (factionId ? { factionId } : null)) },
  }) as unknown as GameSnapshot;
const reorder = { kind: 'movement-order', order: ['harkonnen', 'atreides'] } as unknown as PieceAction;
const claim = { kind: 'battle-claim', battleId: 'b1', side: 1 } as unknown as PieceAction;

test('a reorder counts as the viewer’s own while it waits and once the room took it, not once refused', () => {
  const changes = new OwnChanges();
  changes.sent('a', reorder, room([]));
  expect(changes.view().movementOrder).toEqual(['harkonnen', 'atreides']);
  changes.settled('a', 'completed');
  expect(changes.view().movementOrder).toEqual(['harkonnen', 'atreides']);
  const refused = new OwnChanges();
  refused.sent('b', reorder, room([]));
  refused.settled('b', 'rejected');
  expect(refused.view().movementOrder).toBeNull();
});

test('only a claim that completes its battle counts, and a dropped connection forgets everything', () => {
  const changes = new OwnChanges();
  changes.sent('first', claim, room([null, null]));
  expect(changes.view().completedBattles).toEqual([]);
  changes.sent('last', claim, room(['atreides', null]));
  expect(changes.view().completedBattles).toEqual(['b1']);
  changes.settled('last', 'completed');
  expect(changes.view().completedBattles).toEqual(['b1']);
  changes.forget();
  expect(changes.view()).toEqual({ movementOrder: null, completedBattles: [] });
});

test('the view stays the same object until something changes', () => {
  const changes = new OwnChanges();
  const view = changes.view();
  changes.settled('unknown', 'completed');
  expect(changes.view()).toBe(view);
});
