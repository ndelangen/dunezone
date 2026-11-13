import { isRedirect } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { db } from '@db/core';

import { redirectFromFormerAddress, redirectToOwnFactionAddress } from './formerAddress';

vi.mock('@db/core', () => ({ db: { query: vi.fn() } }));
afterEach(() => vi.resetAllMocks());

const address = { kind: 'faction', slug: 'atreides' } as const;

describe('former address redirects', () => {
  test('a moved record answers with a permanent redirect that keeps the query and fragment', async () => {
    vi.mocked(db.query).mockResolvedValueOnce('/rulesets/modern/rulebooks/guide');
    const thrown = await redirectFromFormerAddress(
      address,
      { searchStr: '?edition=2', hash: 'setup' },
      '/editions'
    ).then(
      () => null,
      (error: unknown) => error
    );
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      status: 301,
      options: { href: '/rulesets/modern/rulebooks/guide/editions?edition=2#setup' },
    });
  });

  test('no former record, and a backend without the lookup, both leave the page at its 404', async () => {
    vi.mocked(db.query).mockResolvedValueOnce(null);
    await expect(redirectFromFormerAddress(address, { searchStr: '', hash: '' })).resolves.toBeUndefined();
    vi.mocked(db.query).mockRejectedValueOnce(
      new Error("Could not find public function for 'formerAddresses:resolve'")
    );
    await expect(redirectFromFormerAddress(address, { searchStr: '', hash: '' })).resolves.toBeUndefined();
  });

  test('an outage stays an error rather than telling crawlers the page is gone', async () => {
    vi.mocked(db.query).mockRejectedValueOnce(new Error('fetch failed'));
    await expect(redirectFromFormerAddress(address, { searchStr: '', hash: '' })).rejects.toThrow('fetch failed');
  });
});

describe('own faction address redirects', () => {
  test("a faction's own address moves to its variant's with a temporary redirect, keeping the page, query and fragment", () => {
    let thrown: unknown = null;
    try {
      redirectToOwnFactionAddress('atreides', 'atreides-original', { searchStr: '?tab=leaders', hash: 'top' }, '/edit');
    } catch (error) {
      thrown = error;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      status: 302,
      options: { href: '/factions/atreides-original/edit?tab=leaders#top' },
    });
  });

  test("the variant's own address stays put", () => {
    expect(() =>
      redirectToOwnFactionAddress('atreides-original', 'atreides-original', { searchStr: '', hash: '' })
    ).not.toThrow();
  });
});
