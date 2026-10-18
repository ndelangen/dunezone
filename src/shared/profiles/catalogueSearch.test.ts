import { describe, expect, test } from 'vitest';

import { PROFILE_CATALOGUE_QUERY_LIMIT, parseProfileCatalogueSearch } from './catalogueSearch';

describe('profile directory search parameters', () => {
  test('keeps a page number only from the second page on, so the first page has one address', () => {
    expect(parseProfileCatalogueSearch({ page: '3' })).toEqual({ page: 3 });
    for (const page of [1, 0, -2, 2.5, 'two', '']) {
      expect(parseProfileCatalogueSearch({ page })).toEqual({});
    }
  });

  test('writes A to Z out only to override best match while searching', () => {
    expect(parseProfileCatalogueSearch({ sort: 'name' })).toEqual({});
    expect(parseProfileCatalogueSearch({ sort: 'name', q: ' stilgar ' })).toEqual({ sort: 'name', q: 'stilgar' });
    expect(parseProfileCatalogueSearch({ sort: 'newest' })).toEqual({ sort: 'newest' });
    expect(parseProfileCatalogueSearch({ sort: 'relevance', q: '  ' })).toEqual({});
  });

  test('cuts a search at the longest one the directory runs', () => {
    expect(parseProfileCatalogueSearch({ q: 'a'.repeat(PROFILE_CATALOGUE_QUERY_LIMIT + 20) }).q).toHaveLength(
      PROFILE_CATALOGUE_QUERY_LIMIT
    );
  });
});
