import { describe, expect, test } from 'vitest';

import { FAQ_CATALOGUE_QUERY_LIMIT, parseFaqCatalogueSearch } from './catalogueSearch';

describe('ruleset FAQ search parameters', () => {
  test('keeps a page number only from the second page on, so the first page has one address', () => {
    expect(parseFaqCatalogueSearch({ page: '3' })).toEqual({ page: 3 });
    for (const page of [1, 0, -2, 2.5, 'two', '']) {
      expect(parseFaqCatalogueSearch({ page })).toEqual({});
    }
  });

  test('keeps a known tag and a trimmed search, and drops anything else', () => {
    expect(parseFaqCatalogueSearch({ tag: 'errata', q: ' storm ' })).toEqual({ tag: 'errata', q: 'storm' });
    expect(parseFaqCatalogueSearch({ tag: 'gossip', q: '   ' })).toEqual({});
  });

  test('drops the page alongside a search, which is always best match and loads more in place', () => {
    expect(parseFaqCatalogueSearch({ q: 'storm', page: '3' })).toEqual({ q: 'storm' });
    expect(parseFaqCatalogueSearch({ q: 'storm', tag: 'errata', page: '3' })).toEqual({ q: 'storm', tag: 'errata' });
    /* A search that is blank once trimmed is no search, so the page stays. */
    expect(parseFaqCatalogueSearch({ q: '   ', page: '3' })).toEqual({ page: 3 });
  });

  test('cuts a search at the longest one the FAQ runs', () => {
    expect(parseFaqCatalogueSearch({ q: 'a'.repeat(FAQ_CATALOGUE_QUERY_LIMIT + 20) }).q).toHaveLength(
      FAQ_CATALOGUE_QUERY_LIMIT
    );
  });
});
