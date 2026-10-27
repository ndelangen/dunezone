import type { GameSnapshot } from '@shared/play/protocol';
import { expect, test } from 'vite-plus/test';

import type { Landing } from '../table/localTable';
import type { TablePlayers } from './chapterScript';
import { movingPieces } from './movingPieces';

/* The player's three troops, split off their reserves on the rim, and where they lie as the test moves them. */
const troop = (position: number[], ...ids: string[]) => ({
  id: `stack-${ids.join('')}`,
  stackKey: 'troops:atreides:troop',
  position,
  items: ids.map((id) => ({ id })),
});
const RIM = [1000, 0, 0];
const BOARD = [0, 0, 0];

function carryStack() {
  let pieces = [troop(RIM, 'a', 'b', 'c'), troop(RIM, 'd', 'e', 'f', 'g')];
  const snapshot = () => ({ bank: { factionId: 'atreides' }, table: { pieces } }) as unknown as GameSnapshot;
  const landings: Landing[] = [];
  const players: TablePlayers = { act: () => {}, viewOf: snapshot, others: () => [], landings: () => landings };
  const step = movingPieces.tasks(snapshot, players).find((candidate) => candidate.id === 'carry-stack')!;
  const baseline = step.begin({} as never);
  return {
    landed: (...landed: Landing[]) => {
      landings.push(...landed);
      pieces = [troop(BOARD, 'a', 'b', 'c'), troop(RIM, 'd', 'e', 'f', 'g')];
    },
    done: () => step.done(baseline, {} as never),
  };
}

test('carrying all three at once completes the step', () => {
  const table = carryStack();
  table.landed({ itemIds: ['a', 'b', 'c'], grew: false });
  expect(table.done()).toBe(true);
});

test('the three dragged onto one stack one at a time do not', () => {
  const table = carryStack();
  table.landed({ itemIds: ['a'], grew: false }, { itemIds: ['b'], grew: false }, { itemIds: ['c'], grew: false });
  expect(table.done()).toBe(false);
});
