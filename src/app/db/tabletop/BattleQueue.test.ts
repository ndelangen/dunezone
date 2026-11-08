import { emptyBattlePlan, fixtureBattleFaces } from '@shared/play/battle';
import { initialSnapshot } from '@shared/play/commands';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, test, vi } from 'vite-plus/test';

import { BattleQueue } from './BattleQueue';

function battleSnapshot(): GameSnapshot {
  return {
    ...initialSnapshot(),
    phase: 6,
    battlePlan: emptyBattlePlan(fixtureBattleFaces('harkonnen')),
    battle: {
      id: 'battle-one',
      anchor: [0, 0, 0],
      territory: 'Marked territory',
      stage: 'preparing',
      deadline: null,
      sides: [{ factionId: 'harkonnen', ready: false, choice: null }, null],
    },
  };
}

test('an edit held back while the table cannot send, as during a resync, still shows and goes out once it can', () => {
  const snapshot = battleSnapshot();
  let canAct = false;
  const sendPlan = vi.fn();
  const queue = new BattleQueue({
    canAct: () => canAct,
    snapshot: () => snapshot,
    sendPlan,
    command: vi.fn(),
    hasRoom: () => true,
  });
  queue.editPlan('battle-one', { adjustment: 2 });
  expect(sendPlan).not.toHaveBeenCalled();
  expect(queue.shown(snapshot, false).battlePlan?.adjustment).toBe(2);
  canAct = true;
  queue.flush();
  expect(sendPlan).toHaveBeenCalledWith(
    expect.any(String),
    'battle-one',
    expect.objectContaining({ adjustment: 2 }),
    snapshot.revision
  );
  expect(queue.shown(snapshot, false).battlePlan?.adjustment).toBe(2);
});

test('an edit the room has not answered counts its own strength, not the strength the room last answered', () => {
  const snapshot = battleSnapshot();
  const queue = new BattleQueue({
    canAct: () => false,
    snapshot: () => snapshot,
    sendPlan: vi.fn(),
    command: vi.fn(),
    hasRoom: () => true,
  });
  queue.editPlan('battle-one', { adjustment: 2 });
  expect(queue.shown(snapshot, false).battlePlan?.strength).toBe(2);
  /* Advanced dialing: two unsupported troops at half strength and one supported at full. */
  queue.editPlan('battle-one', { troops: [{ faceId: 'harkonnen-front', undialed: 2, dialed: 1 }], spice: 1 });
  expect(queue.shown(snapshot, false).battlePlan?.strength).toBe(4);
});

test('an unanswered Advanced Max edit spends the spice on support the way the room will', () => {
  const snapshot = battleSnapshot();
  const queue = new BattleQueue({
    canAct: () => false,
    snapshot: () => snapshot,
    sendPlan: vi.fn(),
    command: vi.fn(),
    hasRoom: () => true,
  });
  /* Raising a face's count leaves its support to the room, as the dial's own edit does. */
  queue.editPlan('battle-one', { troops: [{ faceId: 'harkonnen-front', undialed: 7, dialed: 0 }], spice: 6 });
  const plan = queue.shown(snapshot, false).battlePlan;
  expect(plan?.troops).toEqual([{ faceId: 'harkonnen-front', undialed: 1, dialed: 6 }]);
  expect(plan?.strength).toBe(6.5);
  /* A spice-only edit moves the support with it. */
  queue.editPlan('battle-one', { spice: 4 });
  expect(queue.shown(snapshot, false).battlePlan).toMatchObject({ spice: 4, strength: 5.5 });
});
