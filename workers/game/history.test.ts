import { describe, expect, it } from 'vitest';

import type { GameSnapshot } from '../../src/shared/play/protocol';
import { applyPatch, diff } from './history';

const snapshot = (value: unknown) => value as GameSnapshot;
const piece = (id: string, x = 0) => ({
  id,
  label: `Piece ${id}`,
  position: [x, 0.4, 0],
  items: [{ id: `${id}-item` }],
});

/** Seeded random JSON values, and variations of them that change, add and drop entries at every depth. */
function randomJson(seed: number) {
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
  const below = (count: number) => Math.floor(random() * count);
  const scalar = () => [null, true, 1, 'text', below(5)][below(5)];
  const list = (depth: number) => Array.from({ length: below(5) }, () => value(depth - 1));
  const record = (depth: number) =>
    Object.fromEntries(Array.from({ length: below(4) }, () => [`k${below(4)}`, value(depth - 1)]));
  function value(depth: number): unknown {
    const roll = random();
    if (depth === 0 || roll < 0.3) {
      return scalar();
    }
    return roll < 0.65 ? list(depth) : record(depth);
  }
  const maybeVary = (entry: unknown, depth: number) => (random() < 0.5 ? vary(entry, depth - 1) : entry);
  function varyList(input: unknown[], depth: number) {
    const copy = input.map((entry) => maybeVary(entry, depth));
    if (random() < 0.3) {
      return copy.slice(0, below(copy.length));
    }
    return random() < 0.3 ? [...copy, value(1)] : copy;
  }
  const varyRecord = (input: object, depth: number) =>
    Object.fromEntries(
      Object.entries(input)
        .filter(() => random() > 0.2)
        .map(([key, entry]) => [key, maybeVary(entry, depth)])
    );
  function vary(input: unknown, depth: number): unknown {
    if (random() < 0.3 || depth === 0) {
      return value(2);
    }
    if (Array.isArray(input)) {
      return varyList(input, depth);
    }
    return input && typeof input === 'object' ? varyRecord(input, depth) : value(1);
  }
  return { value, vary };
}

describe('history patches', () => {
  it('stores one moved piece by its index instead of the whole list', () => {
    const before = snapshot({ table: { pieces: [piece('a'), piece('b'), piece('c')] } });
    const after = snapshot({ table: { pieces: [piece('a'), piece('b', 2), piece('c')] } });
    expect(diff(before, after)).toEqual([{ path: ['table', 'pieces', '1', 'position', '0'], value: 2 }]);
    expect(applyPatch(before, diff(before, after))).toEqual(after);
  });

  it('adds new pieces at their indices and shortens a list by its length', () => {
    const three = snapshot({ pieces: [piece('a'), piece('b'), piece('c')] });
    const four = snapshot({ pieces: [piece('a'), piece('b'), piece('c'), piece('d')] });
    const two = snapshot({ pieces: [piece('a'), piece('b')] });
    expect(diff(three, four)).toEqual([{ path: ['pieces', '3'], value: piece('d') }]);
    expect(diff(three, two)).toEqual([{ path: ['pieces', 'length'], value: 2 }]);
    expect(applyPatch(three, diff(three, four))).toEqual(four);
    expect(applyPatch(three, diff(three, two))).toEqual(two);
  });

  it('replaces a list whole when that is the smaller patch', () => {
    const before = snapshot({ order: ['a', 'b', 'c', 'd'] });
    const after = snapshot({ order: ['d', 'c', 'b', 'a'] });
    expect(diff(before, after)).toEqual([{ path: ['order'], value: ['d', 'c', 'b', 'a'] }]);
  });

  it('replays any change between two JSON values exactly', () => {
    const json = randomJson(7);
    for (let run = 0; run < 2000; run++) {
      const root = json.value(4);
      const before = snapshot({ root });
      const after = snapshot({ root: json.vary(root, 4) });
      /* Objects keep their keys' original order through a patch, as they always have; the values are what must match. */
      expect(applyPatch(before, diff(before, after))).toEqual(after);
    }
  });
});
