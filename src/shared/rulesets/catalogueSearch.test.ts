import { describe, expect, test } from 'vitest';

import { RULESET_CATALOGUE_QUERY_LIMIT, parseRulesetCatalogueSearch } from './catalogueSearch';

describe('ruleset catalogue search parameters', () => {
  test('keeps a page number only from the second page on, so the first page has one address', () => {
    expect(parseRulesetCatalogueSearch({ page: '3' })).toEqual({ page: 3 });
    for (const page of [1, 0, -2, 2.5, 'two', '']) {
      expect(parseRulesetCatalogueSearch({ page })).toEqual({});
    }
  });

  test('never writes the default order out, and drops anything else', () => {
    expect(parseRulesetCatalogueSearch({ sort: 'name' })).toEqual({});
    expect(parseRulesetCatalogueSearch({ sort: 'newest' })).toEqual({ sort: 'newest' });
    expect(parseRulesetCatalogueSearch({ sort: 'relevance', q: '  ' })).toEqual({});
  });

  test('drops the order and the page alongside a search, which is always best match and loads more in place', () => {
    expect(parseRulesetCatalogueSearch({ sort: 'newest', q: ' dreamrules ', page: '2' })).toEqual({ q: 'dreamrules' });
    /* A search that is blank once trimmed is no search, so the page stays. */
    expect(parseRulesetCatalogueSearch({ q: '   ', page: '3' })).toEqual({ page: 3 });
  });

  test('cuts a search at the longest one the catalogue runs', () => {
    expect(parseRulesetCatalogueSearch({ q: 'a'.repeat(RULESET_CATALOGUE_QUERY_LIMIT + 20) }).q).toHaveLength(
      RULESET_CATALOGUE_QUERY_LIMIT
    );
  });
});
