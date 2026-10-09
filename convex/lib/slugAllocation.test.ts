// @vitest-environment edge-runtime

import { afterEach, expect, test, vi } from 'vitest';

import { selectSlug } from './slugAllocation';

afterEach(() => vi.restoreAllMocks());

test('policy can reject a counter word and choose the next accepted address', async () => {
  const available = vi.fn(async () => true);
  const result = await selectSlug({
    base: 'party',
    nextSuffix: Number.parseInt('bad', 36),
    available,
    accept: (slug) => slug !== 'party' && !slug.endsWith('-bad'),
  });
  expect(result?.slug).toBe('party-bae');
  expect(available).toHaveBeenCalledExactlyOnceWith('party-bae');
});

test('a rejected window recovers through fresh random candidates on the next attempt', async () => {
  const random = vi.spyOn(crypto, 'getRandomValues');
  random.mockReturnValueOnce(new Uint32Array(2)).mockReturnValueOnce(new Uint32Array(2));
  const accept = (slug: string) => /-[a-z0-9]{13}$/.test(slug) && !slug.endsWith('-0000000000000');
  expect(await selectSlug({ base: 'party', nextSuffix: 1, available: async () => true, accept })).toBeNull();
  random.mockReturnValueOnce(new Uint32Array([0, 1]));
  expect((await selectSlug({ base: 'party', nextSuffix: 1, available: async () => true, accept }))?.slug).toBe(
    'party-0000000000001'
  );
});

test('occupied candidates have a bounded read budget even with a dense legacy range', async () => {
  const available = vi.fn(async () => false);
  expect(await selectSlug({ base: 'party', nextSuffix: 1, available })).toBeNull();
  expect(available).toHaveBeenCalledTimes(7);
});

test('exhausted and unsafe cursors still allocate a bounded random address', async () => {
  for (const nextSuffix of [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    const available = vi.fn(async (slug: string) => slug !== 'party');
    const selected = await selectSlug({ base: 'party', nextSuffix, available });
    expect(selected?.slug).toMatch(/^party-[a-z0-9]{13}$/);
    expect(selected?.nextSuffix).toBe(Number.MAX_SAFE_INTEGER);
    expect(available).toHaveBeenCalledTimes(2);
  }
});
