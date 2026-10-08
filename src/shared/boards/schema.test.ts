import { describe, expect, it } from 'vitest';

import { arrakisBoard, blankBoard } from './geometry';
import { BoardAsset } from './schema';

describe('Saved boards', () => {
  it('accepts the complete editable Arrakis preset', () => {
    const board = arrakisBoard();
    const parsed = BoardAsset.parse({ name: 'Arrakis', about: '', board });
    expect(parsed.board).toEqual(board);
    expect(Object.values(parsed.board.properties)).toHaveLength(42);
  });
  it('accepts unfinished linework and rejects references to missing points', () => {
    const board = blankBoard();
    board.nodes.loose = [200, 200];
    board.nodes.end = [210, 230];
    board.edges.push({ id: 'open', a: 'loose', b: 'end', kind: 'line' });
    expect(BoardAsset.safeParse({ name: 'Open', about: '', board }).success).toBe(true);
    board.edges[board.edges.length - 1].b = 'missing';
    expect(BoardAsset.safeParse({ name: 'Broken', about: '', board }).success).toBe(false);
  });
  it('refuses outside points, duplicate territory names and arbitrary artwork URLs', () => {
    const board = arrakisBoard();
    board.nodes.n335 = [999, 999];
    expect(BoardAsset.safeParse({ name: 'Board', about: '', board }).success).toBe(false);
    const named = arrakisBoard();
    const values = Object.values(named.properties);
    values[1].name = values[0].name;
    expect(BoardAsset.safeParse({ name: 'Board', about: '', board: named }).success).toBe(false);
    const artwork = arrakisBoard();
    Object.values(artwork.properties).find((p) => p.decals.length)!.decals[0].artwork =
      'https://example.com/art.svg' as never;
    expect(BoardAsset.safeParse({ name: 'Board', about: '', board: artwork }).success).toBe(false);
  });
});

it('rejects an arc that leaves the circle even when all its points are inside', () => {
  const board = blankBoard();
  board.nodes.a = [241.780172, 148.215365];
  board.nodes.b = [47.615742, 236.669771];
  board.edges.push({ id: 'outside-arc', a: 'a', b: 'b', kind: 'arc', arc: [6732.934731, 6732.934731, 0, 1, 1] });
  expect(BoardAsset.safeParse({ name: 'Board', about: '', board }).success).toBe(false);
});

it('reports missing curve controls through safeParse without throwing', () => {
  for (const kind of ['arc', 'cubic'] as const) {
    const board = blankBoard();
    board.nodes.a = [200, 200];
    board.nodes.b = [220, 230];
    board.edges.push({ id: 'malformed', a: 'a', b: 'b', kind });
    expect(BoardAsset.safeParse({ name: 'Board', about: '', board }).success).toBe(false);
  }
});
