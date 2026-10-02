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
    let seed = 7;
    const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
    const value = (depth: number): unknown => {
      const roll = random();
      if (depth === 0 || roll < 0.3) {
        return [null, true, 1, 'text', Math.floor(random() * 5)][Math.floor(random() * 5)];
      }
      if (roll < 0.65) {
        return Array.from({ length: Math.floor(random() * 5) }, () => value(depth - 1));
      }
      return Object.fromEntries(
        Array.from({ length: Math.floor(random() * 4) }, () => [`k${Math.floor(random() * 4)}`, value(depth - 1)])
      );
    };
    const vary = (input: unknown, depth: number): unknown => {
      if (random() < 0.3 || depth === 0) {
        return value(2);
      }
      if (Array.isArray(input)) {
        const copy = input.map((entry) => (random() < 0.5 ? vary(entry, depth - 1) : entry));
        return random() < 0.3
          ? copy.slice(0, Math.floor(random() * copy.length))
          : [...copy, ...(random() < 0.3 ? [value(1)] : [])];
      }
      if (input && typeof input === 'object') {
        return Object.fromEntries(
          Object.entries(input)
            .filter(() => random() > 0.2)
            .map(([key, entry]) => [key, random() < 0.5 ? vary(entry, depth - 1) : entry])
        );
      }
      return value(1);
    };
    for (let run = 0; run < 2000; run++) {
      const before = snapshot({ root: value(4) });
      const after = snapshot({ root: vary((before as unknown as { root: unknown }).root, 4) });
      const patched = applyPatch(before, diff(before, after));
      /* Objects keep their keys' original order through a patch, as they always have; the values are what must match. */
      expect(patched).toEqual(after);
    }
  });
});
