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
