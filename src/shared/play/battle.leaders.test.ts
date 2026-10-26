import { expect, test } from 'vite-plus/test';

import {
  battleActionSchema,
  battlePlanSchema,
  publicBattleSchema,
  emptyBattlePlan,
  isBattleLeader,
  storedBattlePlanSchema,
} from './battle';
import { freshTableState } from './model';

test('standalone and disc leaders can fight while troop and faction tokens remain excluded', () => {
  const troop = freshTableState().pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
  const leader = {
    ...troop,
    items: [{ ...troop.items[0]!, artwork: { type: 'token-leader', front: '/leader.jpg', back: '/leader.jpg' } }],
  };
  expect(isBattleLeader(leader)).toBe(true);
  expect(isBattleLeader({ ...leader, stackKey: 'faction-token:ecaz' })).toBe(false);
  expect(isBattleLeader(troop)).toBe(false);
  expect(isBattleLeader({ ...leader, kind: 'card' })).toBe(false);
  expect(
    isBattleLeader({
      ...leader,
      items: [{ ...leader.items[0]!, artwork: { ...leader.items[0]!.artwork, type: 'token-disc' } }],
    })
  ).toBe(true);
});

test('a plan sent or stored with the single leaderId of before reads as a list of that one', () => {
  const { leaderIds: _none, ...stored } = emptyBattlePlan([]);
  expect(storedBattlePlanSchema.parse({ ...stored, leaderId: 'stilgar' }).leaderIds).toEqual(['stilgar']);
  expect(storedBattlePlanSchema.parse({ ...stored, leaderId: null }).leaderIds).toEqual([]);
  expect(battlePlanSchema.parse({ ...stored, leaderId: 'stilgar' }).leaderIds).toEqual(['stilgar']);
  const action = battleActionSchema.parse({
    kind: 'battle-plan',
    battleId: 'battle',
    plan: { mode: 'max', troops: [], spice: 0, adjustment: 0, leaderId: 'stilgar', cardIds: [] },
  });
  expect(action.kind === 'battle-plan' && action.plan.leaderIds).toEqual(['stilgar']);
});

test('an early reveal cached with the single leader of before reads as a list of that one', () => {
  const leader = freshTableState().pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
  const [disclosed] = publicBattleSchema.shape.disclosed.parse([{ leader, cards: [] }, null])!;
  expect(disclosed?.leaders?.map((piece) => piece.id)).toEqual([leader.id]);
});
