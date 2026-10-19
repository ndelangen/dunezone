import { describe, expect, test } from 'vitest';

import {
  complexityRangeSearchValue,
  FACTION_CATALOGUE_QUERY_LIMIT,
  parseComplexityRange,
  parseFactionCatalogueSearch,
} from './catalogueSearch';

describe('faction catalogue search parameters', () => {
  test('round-trips canonical complexity ranges and rejects malformed ranges', () => {
    expect(parseComplexityRange('3-8')).toEqual([3, 8]);
    expect(complexityRangeSearchValue([3, 8])).toBe('3-8');
    expect(parseComplexityRange('8-3')).toEqual([0, 10]);
    expect(parseComplexityRange('3-11')).toEqual([0, 10]);
    expect(complexityRangeSearchValue([0, 10])).toBeUndefined();
  });

  test('keeps a page number only from the second page on, so the first page has one address', () => {
    expect(parseFactionCatalogueSearch({ page: 3 })).toEqual({ page: 3 });
    expect(parseFactionCatalogueSearch({ page: '3' })).toEqual({ page: 3 });
    for (const page of [1, 0, -2, 2.5, 'two', '', null]) {
      expect(parseFactionCatalogueSearch({ page })).toEqual({});
    }
  });

  test('accepts every browsing order but the default, and drops anything else', () => {
    expect(parseFactionCatalogueSearch({ sort: 'created' })).toEqual({ sort: 'created' });
    expect(parseFactionCatalogueSearch({ sort: 'name' })).toEqual({});
    expect(parseFactionCatalogueSearch({ sort: 'relevance' })).toEqual({});
  });

  test('drops the order and the page alongside a search, which is always best match and loads more in place', () => {
    expect(parseFactionCatalogueSearch({ q: ' leto ', sort: 'created', page: '3' })).toEqual({ q: 'leto' });
    expect(parseFactionCatalogueSearch({ q: 'leto', ruleset: 'classic', complexity: '2-5' })).toEqual({
      q: 'leto',
      ruleset: 'classic',
      complexity: '2-5',
    });
  });

  test('cuts a search at the query limit', () => {
    const long = `${'a'.repeat(FACTION_CATALOGUE_QUERY_LIMIT)}tail`;
    expect(parseFactionCatalogueSearch({ q: long })).toEqual({ q: 'a'.repeat(FACTION_CATALOGUE_QUERY_LIMIT) });
  });
});
