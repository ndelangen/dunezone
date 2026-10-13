import { isRedirect } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { db } from '@db/core';

import { redirectFromFormerAddress } from './formerAddress';

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
});
