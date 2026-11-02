import { describe, expect, test } from 'vite-plus/test';

import { readRenamedEmblems } from './renamedEmblem';

describe('data from the emblem rename', () => {
  test('reads under the current names at any depth, and leaves everything else alone', () => {
    expect(
      readRenamedEmblems({
        name: 'Atreides',
        emblem: '/vector/emblem/atreides.svg',
        decals: [{ id: '/vector/emblem/fremen.svg' }, { id: '/vector/generic/axes.svg' }],
        emblemUrl: '/vector/emblem/ixian.svg',
        about: 'See /vector/emblem/ later.',
        showDuneLogo: true,
      })
    ).toEqual({
      name: 'Atreides',
      logo: '/vector/logo/atreides.svg',
      decals: [{ id: '/vector/logo/fremen.svg' }, { id: '/vector/generic/axes.svg' }],
      emblemUrl: '/vector/logo/ixian.svg',
      about: 'See /vector/emblem/ later.',
      showDuneLogo: true,
    });
  });

  test('keeps a current `logo` over a new key, and passes plain values through', () => {
    expect(readRenamedEmblems({ logo: '/vector/logo/a.svg', emblem: '/vector/emblem/b.svg' })).toEqual({
      logo: '/vector/logo/a.svg',
    });
    expect(readRenamedEmblems(null)).toBeNull();
    expect(readRenamedEmblems(7)).toBe(7);
  });

  test('passes bytes, dates and other class instances through untouched', () => {
    const bytes = new ArrayBuffer(4);
    const when = new Date(0);
    const blob = new Blob(['x']);
    const read = readRenamedEmblems({ bytes, when, blob, list: [new Uint8Array(2)] }) as Record<string, unknown>;
    expect(read.bytes).toBe(bytes);
    expect(read.when).toBe(when);
    expect(read.blob).toBe(blob);
    expect((read.list as unknown[])[0]).toBeInstanceOf(Uint8Array);
  });

  test('returns data that needs no rename as the same reference', () => {
    const current = {
      name: 'Atreides',
      logo: '/vector/logo/atreides.svg',
      decals: [{ id: '/vector/generic/axes.svg' }],
    };
    expect(readRenamedEmblems(current)).toBe(current);
    const mixed = { same: current, next: { emblem: '/vector/emblem/a.svg' } };
    const read = readRenamedEmblems(mixed) as typeof mixed;
    expect(read).not.toBe(mixed);
    expect(read.same).toBe(current);
  });
});
