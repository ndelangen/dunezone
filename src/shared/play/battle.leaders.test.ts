import { expect, test } from 'vite-plus/test';

import { isBattleLeader } from './battle';
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
