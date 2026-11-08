import { describe, expect, test } from 'vite-plus/test';

import { arrakisBoard, derivedBoard, removeConnection } from './geometry';

describe('derivedBoard', () => {
  test('derives equal linework once, whichever object carries it', () => {
    const seeded = arrakisBoard();
    const live = arrakisBoard();
    expect(live).not.toBe(seeded);
    expect(derivedBoard(live)).toBe(derivedBoard(seeded));
  });

  test('derives again when the linework changes', () => {
    const board = arrakisBoard();
    const edited = removeConnection(board, board.edges.find((edge) => !edge.fixed && !edge.id.startsWith('rim'))!.id);
    expect(derivedBoard(edited)).not.toBe(derivedBoard(board));
  });

  test('ignores territory properties, which do not shape faces', () => {
    const board = arrakisBoard();
    const renamed = { ...board, properties: {} };
    expect(derivedBoard(renamed)).toBe(derivedBoard(board));
  });
});
