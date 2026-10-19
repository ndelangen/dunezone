import { describe, expect, test } from 'vitest';

import { ASSET_CATALOGUE_QUERY_LIMIT, parseAssetCatalogueSearch } from './catalogueSearch';

describe('asset catalogue search parameters', () => {
  test('keeps a page number only from the second page on, so the first page has one address', () => {
    expect(parseAssetCatalogueSearch({ page: '4' })).toEqual({ page: 4 });
    for (const page of [1, 0, -2, 2.5, 'two', '']) {
      expect(parseAssetCatalogueSearch({ page })).toEqual({});
    }
  });

  test('never writes the default order out, and drops anything else', () => {
    expect(parseAssetCatalogueSearch({ sort: 'newest' })).toEqual({});
    expect(parseAssetCatalogueSearch({ sort: 'name' })).toEqual({ sort: 'name' });
    expect(parseAssetCatalogueSearch({ sort: 'relevance', q: '  ' })).toEqual({});
  });

  test('drops the order and the page alongside a search, which is always best match and loads more in place', () => {
    expect(parseAssetCatalogueSearch({ sort: 'name', q: ' lasgun ', page: '2' })).toEqual({ q: 'lasgun' });
  });

  test('cuts a search at the longest one the catalogue runs', () => {
    expect(parseAssetCatalogueSearch({ q: 'a'.repeat(ASSET_CATALOGUE_QUERY_LIMIT + 20) }).q).toHaveLength(
      ASSET_CATALOGUE_QUERY_LIMIT
    );
  });
});
