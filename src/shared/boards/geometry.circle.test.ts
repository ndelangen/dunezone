import { describe, expect, it } from 'vitest';

import {
  arrakisBoard,
  removeConnection,
  removePoint,
  at,
  blankBoard,
  CENTER,
  connectPoint,
  distance,
  movePoint,
  RADIUS,
} from './geometry';
import type { Board } from './geometry';

function openBoard(): Board {
  const board = blankBoard();
  board.nodes.a = [340, 130];
  board.nodes.loose = [385, 300];
  board.nodes.tip = [410, 337];
  board.edges.push({ id: 'unfinished-cut', a: 'loose', b: 'tip', kind: 'line' });
  return board;
}

function expectCircle(board: Board) {
  let totalAngle = 0;
  for (const edge of board.edges.filter((edge) => edge.id.startsWith('rim'))) {
    let previous = at(board, edge, 0);
    for (let sample = 0; sample <= 20; sample++) {
      const point = at(board, edge, sample / 20);
      expect(Math.abs(distance(point, CENTER) - RADIUS)).toBeLessThan(1e-6);
      const a = [previous[0] - CENTER[0], previous[1] - CENTER[1]];
      const b = [point[0] - CENTER[0], point[1] - CENTER[1]];
      totalAngle += Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]));
      previous = point;
    }
  }
  expect(totalAngle).toBeCloseTo(Math.PI * 2, 6);
}

describe('Fixed circular board boundary', () => {
  it('keeps moved interior points inside the circle', () => {
    const board = movePoint(openBoard(), 'a', [700, -300]);
    expect(distance(board.nodes.a, CENTER)).toBeCloseTo(RADIUS, 8);
    expectCircle(board);
  });

  it('slides rim points while preserving the entire circle and neighbor order', () => {
    let board = openBoard();
    for (const point of [
      [300, 20],
      [600, 243.53],
      [-100, 700],
    ] as [number, number][]) {
      board = movePoint(board, 'n', point);
      expect(distance(board.nodes.n, CENTER)).toBeCloseTo(RADIUS, 8);
      expectCircle(board);
    }
  });

  it('bounds newly placed points even with snapping off', () => {
    const result = connectPoint(openBoard(), [700, 700], false);
    expect(distance(result.board.nodes[result.node], CENTER)).toBeCloseTo(RADIUS, 8);
    expectCircle(result.board);
  });

  it('keeps an inserted rim point between its neighbors', () => {
    const inserted = connectPoint(blankBoard(), [410, 410], false, 0.5, 'rim-0');
    const moved = movePoint(inserted.board, inserted.node, [100, 400]);
    expect(moved.nodes[inserted.node][0]).toBeGreaterThan(CENTER[0]);
    expect(moved.nodes[inserted.node][1]).toBeGreaterThan(CENTER[1]);
    expectCircle(moved);
  });
});

it('keeps every imported Arrakis rim curve intact when deleting or moving its points', () => {
  const board = arrakisBoard();
  const rim = board.edges.filter((edge) => edge.fixed);
  expect(rim.length).toBeGreaterThan(0);
  for (const edge of rim) {
    expect(removeConnection(board, edge.id)).toBe(board);
    expect(removePoint(board, edge.a)).toBe(board);
    expect(movePoint(board, edge.a, CENTER)).toBe(board);
  }
});
it('removes interior connections while keeping open endpoints movable', () => {
  const board = openBoard();
  const cut = removeConnection(board, 'unfinished-cut');
  expect(cut.nodes).toEqual(board.nodes);
  expect(movePoint(cut, 'tip', [200, 200]).nodes.tip).toEqual([200, 200]);
});
