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
});
