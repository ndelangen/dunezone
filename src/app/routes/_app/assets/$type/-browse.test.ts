import { describe, expect, test } from 'vitest';

import type { AssetBrowseEntry } from '@app/db/assets';

import { applyAssetBrowseSearch, parseAssetBrowseSearch } from './-browse';

function entry(name: string, options: { owner?: string; deckCount?: number } = {}): AssetBrowseEntry {
  return {
    id: `k17${name.toLowerCase()}` as AssetBrowseEntry['id'],
    type: 'card-treachery',
    slug: name.toLowerCase(),
    name,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    owner: options.owner ? { id: 'p1' as never, slug: options.owner, username: options.owner, avatar_url: null } : null,
    data: {},
    deckCount: options.deckCount ?? 0,
    deckCountCapped: false,
    /* Nothing in the search, the sorts or the facet reads a member, so every fixture here holds none. */
    members: [],
  };
}

describe('asset browse controls', () => {
  test('a default never reaches the URL, so absence is the only spelling of it', () => {
    expect(parseAssetBrowseSearch({ sort: 'newest', q: '   ', deck: 'all' })).toEqual({});
    expect(parseAssetBrowseSearch({ sort: 'nonsense' })).toEqual({});
    expect(parseAssetBrowseSearch({ q: ' Lasgun ', sort: 'owner', deck: 'none' })).toEqual({
      q: 'Lasgun',
      sort: 'owner',
      deck: 'none',
    });
  });

  test('search covers the two facts a tile actually shows', () => {
    const entries = [entry('Lasgun', { owner: 'stilgar' }), entry('Shield', { owner: 'chani' })];

    expect(applyAssetBrowseSearch(entries, { q: 'las' }).map((found) => found.name)).toEqual(['Lasgun']);
    /* The owner is on the tile, so it is searchable; a reader should not have to know which field they are typing into. */
    expect(applyAssetBrowseSearch(entries, { q: 'chani' }).map((found) => found.name)).toEqual(['Shield']);
  });

  test('the four sorts order by what their labels claim, and the facet keeps only orphans', () => {
    const entries = [
      entry('Shield', { owner: 'zed', deckCount: 1 }),
      entry('Lasgun', { owner: 'amal', deckCount: 3 }),
      entry('Snooper', { owner: 'mid', deckCount: 0 }),
    ];

    /* Newest is the absence of a sort, so the query's own order survives untouched. */
    expect(applyAssetBrowseSearch(entries, {}).map((found) => found.name)).toEqual(['Shield', 'Lasgun', 'Snooper']);
    expect(applyAssetBrowseSearch(entries, { sort: 'name' }).map((found) => found.name)).toEqual([
      'Lasgun',
      'Shield',
      'Snooper',
    ]);
    expect(applyAssetBrowseSearch(entries, { sort: 'owner' }).map((found) => found.name)).toEqual([
      'Lasgun',
      'Snooper',
      'Shield',
    ]);
    expect(applyAssetBrowseSearch(entries, { sort: 'most-used' }).map((found) => found.name)).toEqual([
      'Lasgun',
      'Shield',
      'Snooper',
    ]);
    expect(applyAssetBrowseSearch(entries, { deck: 'none' }).map((found) => found.name)).toEqual(['Snooper']);
  });
});
