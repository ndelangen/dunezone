import { expect, test } from 'vite-plus/test';

import type { Landing } from '../table/localTable';
import { grownCarryLanded } from './guideChecks';
import type { Piece } from './guideChecks';

const stack = (...ids: string[]) => ({ items: ids.map((id) => ({ id })) }) as unknown as Piece;

test('a carry that grew while held counts once all it held lies in one stack', () => {
  const landings: Landing[] = [];
  const check = grownCarryLanded(
    () => landings,
    () => [stack('a', 'b')]
  );
  const seen = check.begin();
  expect(check.done(seen)).toBe(false);
  landings.push({ itemIds: ['a', 'b'], grew: true });
  expect(check.done(seen)).toBe(true);
});

test('a stack picked up whole, pieces set down one at a time, or a carry from before the task never count', () => {
  const landings: Landing[] = [{ itemIds: ['a', 'b'], grew: true }];
  const check = grownCarryLanded(
    () => landings,
    () => [stack('a', 'b')]
  );
  const seen = check.begin();
  landings.push({ itemIds: ['a', 'b'], grew: false }, { itemIds: ['a'], grew: false }, { itemIds: ['b'], grew: false });
  expect(check.done(seen)).toBe(false);
});

test('a grown carry that went back where it came from does not count', () => {
  const landings: Landing[] = [];
  const check = grownCarryLanded(
    () => landings,
    () => [stack('c')]
  );
  const seen = check.begin();
  landings.push({ itemIds: ['a', 'b'], grew: true });
  expect(check.done(seen)).toBe(false);
});
