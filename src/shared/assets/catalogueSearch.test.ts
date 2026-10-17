import { describe, expect, test } from 'vitest';

import { ASSET_CATALOGUE_QUERY_LIMIT, parseAssetCatalogueSearch } from './catalogueSearch';

describe('asset catalogue search parameters', () => {
  test('keeps a page number only from the second page on, so the first page has one address', () => {
    expect(parseAssetCatalogueSearch({ page: '4' })).toEqual({ page: 4 });
    for (const page of [1, 0, -2, 2.5, 'two', '']) {
      expect(parseAssetCatalogueSearch({ page })).toEqual({});
    }
  });

  test('writes newest out only to override best match while searching', () => {
    expect(parseAssetCatalogueSearch({ sort: 'newest' })).toEqual({});
    expect(parseAssetCatalogueSearch({ sort: 'newest', q: ' lasgun ' })).toEqual({ sort: 'newest', q: 'lasgun' });
    expect(parseAssetCatalogueSearch({ sort: 'name' })).toEqual({ sort: 'name' });
    expect(parseAssetCatalogueSearch({ sort: 'relevance', q: '  ' })).toEqual({});
  });

  test('cuts a search at the longest one the catalogue runs', () => {
    expect(parseAssetCatalogueSearch({ q: 'a'.repeat(ASSET_CATALOGUE_QUERY_LIMIT + 20) }).q).toHaveLength(
      ASSET_CATALOGUE_QUERY_LIMIT
    );
  });
});
