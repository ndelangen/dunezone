import { describe, expect, test } from 'vitest';

import type { AssetBrowseEntry } from '@app/db/assets';

import { applyAssetBrowseSearch, parseAssetBrowseSearch } from './browse';

function entry(name: string, options: { owner?: string; updated?: string } = {}): AssetBrowseEntry {
  return {
    id: `k17${name.toLowerCase()}` as AssetBrowseEntry['id'],
    type: 'card-treachery',
    slug: name.toLowerCase(),
    name,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: options.updated ?? '2026-08-01T00:00:00.000Z',
    owner: options.owner ? { id: 'p1' as never, slug: options.owner, username: options.owner, avatar_url: null } : null,
    data: {},
    /* Nothing in the search or the sorts reads a member, so every fixture here holds none. */
    members: [],
  };
}

describe('asset browse controls', () => {
  test('a default never reaches the URL, so absence is the only spelling of it', () => {
    expect(parseAssetBrowseSearch({ sort: 'newest', q: '   ' })).toEqual({});
    expect(parseAssetBrowseSearch({ sort: 'owner' })).toEqual({});
    expect(parseAssetBrowseSearch({ q: ' Lasgun ', sort: 'updated' })).toEqual({
      q: 'Lasgun',
      sort: 'updated',
    });
  });

  test('search matches the name on the tile and the owner behind it', () => {
    const entries = [entry('Lasgun', { owner: 'stilgar' }), entry('Shield', { owner: 'chani' })];

    expect(applyAssetBrowseSearch(entries, { q: 'las' }).map((found) => found.name)).toEqual(['Lasgun']);
    /* The tile no longer names its owner, but a reader can still find their own work by typing themselves. */
    expect(applyAssetBrowseSearch(entries, { q: 'chani' }).map((found) => found.name)).toEqual(['Shield']);
  });

  test('the sorts order by what their labels claim', () => {
    const entries = [
      entry('Shield', { updated: '2026-08-10T00:00:00.000Z' }),
      entry('Lasgun', { updated: '2026-08-20T00:00:00.000Z' }),
      entry('Snooper', { updated: '2026-08-15T00:00:00.000Z' }),
    ];

    /* Newest is the absence of a sort, so the query's own order survives untouched. */
    expect(applyAssetBrowseSearch(entries, {}).map((found) => found.name)).toEqual(['Shield', 'Lasgun', 'Snooper']);
    expect(applyAssetBrowseSearch(entries, { sort: 'name' }).map((found) => found.name)).toEqual([
      'Lasgun',
      'Shield',
      'Snooper',
    ]);
    expect(applyAssetBrowseSearch(entries, { sort: 'updated' }).map((found) => found.name)).toEqual([
      'Lasgun',
      'Snooper',
      'Shield',
    ]);
  });
});
