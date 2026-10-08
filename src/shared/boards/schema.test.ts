import { describe, expect, it } from 'vitest';

import { arrakisBoard, blankBoard } from './geometry';
import { BoardAsset, territoryId } from './schema';

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

it('generates lowercase snake_case IDs from readable names, including older saved boards', () => {
  expect(territoryId('  Rock outcroppings  ')).toBe('rock_outcroppings');
  expect(territoryId("Tuek's Café 2")).toBe('tueks_cafe_2');
  const board = blankBoard();
  const property = Object.values(board.properties)[0];
  property.name = 'Rock outcroppings';
  property.id = 'stale';
  expect(Object.values(BoardAsset.parse({ name: 'Board', about: '', board }).board.properties)[0].id).toBe(
    'rock_outcroppings'
  );
  const legacy = JSON.parse(JSON.stringify(board));
  delete legacy.properties[Object.keys(legacy.properties)[0]].id;
  expect(Object.values(BoardAsset.parse({ name: 'Board', about: '', board: legacy }).board.properties)[0].id).toBe(
    'rock_outcroppings'
  );
});

it.each(['', '   ', '---'])('rejects a territory name that cannot produce an ID: %j', (name) => {
  const board = blankBoard();
  Object.values(board.properties)[0].name = name;
  expect(BoardAsset.safeParse({ name: 'Board', about: '', board }).success).toBe(false);
});

it.each(['ROCK OUTCROPPINGS', 'Rock-outcroppings', 'Rock   outcroppings', 'Róck outcroppings'])(
  'rejects an ID collision from %s',
  (name) => {
    const board = arrakisBoard();
    const [first, second] = Object.keys(board.properties);
    board.properties[first].name = 'Rock outcroppings';
    board.properties[second].name = name;
    const parsed = BoardAsset.safeParse({ name: 'Board', about: '', board });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['board', 'properties', first, 'name'],
            message: 'Territory ID "rock_outcroppings" is already in use',
          }),
          expect.objectContaining({
            path: ['board', 'properties', second, 'name'],
            message: 'Territory ID "rock_outcroppings" is already in use',
          }),
        ])
      );
    }
  }
);

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
