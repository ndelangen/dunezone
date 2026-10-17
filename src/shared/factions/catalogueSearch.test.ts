import { describe, expect, test } from 'vitest';

import { complexityRangeSearchValue, parseComplexityRange, parseFactionCatalogueSearch } from './catalogueSearch';

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

  test('accepts every order the query takes and drops anything else', () => {
    expect(parseFactionCatalogueSearch({ sort: 'name', q: ' leto ' })).toEqual({ sort: 'name', q: 'leto' });
    expect(parseFactionCatalogueSearch({ sort: 'relevance' })).toEqual({});
  });
});
