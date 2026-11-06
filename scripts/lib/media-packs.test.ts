import { describe, expect, test } from 'vite-plus/test';

import { buildPacks, packsWorthFetching, unpack } from './media-packs';

const bytes = (...values: number[]) => new Uint8Array(values);
const variant = (name: string, ...values: number[]) => ({
  name: `${name.padEnd(20, '0')}.aaaaaaaaaa.webp`,
  bytes: bytes(...values),
});

describe('media packs', () => {
  test('groups variants by the first hex digit of their names and tiles each pack in name order', () => {
    const packs = buildPacks([variant('a2', 3), variant('01', 1, 2), variant('a1', 4, 5), variant('01', 1, 2)]);
    expect(packs.map(({ pack }) => pack.entries.map((entry) => entry.name[0]))).toEqual([['0'], ['a', 'a']]);
    const [, { pack, body }] = packs;
    expect(Array.from(body)).toEqual([4, 5, 3]);
    expect(pack.entries.map(({ offset, bytes: length }) => [offset, length])).toEqual([
      [0, 2],
      [2, 1],
    ]);
  });

  test('unpacks only bytes that match the index, and refuses a pack that is not the indexed one', () => {
    const [{ pack, body }] = buildPacks([variant('1', 1), variant('12', 2, 3)]);
    expect(unpack(pack, body).map((entry) => Array.from(entry.bytes))).toEqual([[1], [2, 3]]);

    const tampered = structuredClone(pack);
    tampered.entries[1].sha256 = '0'.repeat(64);
    expect(unpack(tampered, body)).toHaveLength(1);

    expect(() => unpack(pack, bytes(9, 9, 9))).toThrow(/intact/);
  });

  test('picks only packs holding enough missing variants', () => {
    const packs = buildPacks([variant('0', 1), variant('01', 2), variant('f', 3)]).map(({ pack }) => pack);
    const index = { schemaVersion: 1 as const, release: 'r', packs };
    const missing = new Set(packs.flatMap((pack) => pack.entries.map((entry) => entry.name)));
    expect(packsWorthFetching(index, missing, 2).map((pack) => pack.entries.length)).toEqual([2]);
    expect(packsWorthFetching(index, missing, 1)).toHaveLength(2);
  });
});
