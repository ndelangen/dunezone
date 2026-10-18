import { describe, expect, test } from 'vitest';

import { FAQ_CATALOGUE_QUERY_LIMIT } from './catalogueSearch';
import { FAQ_SEARCH_RULESET_LIMIT, globalFaqRulesetSlugs, parseGlobalFaqSearch } from './globalSearch';

describe('global FAQ search parameters', () => {
  test('keeps a page number only from the second page on, so the first page has one address', () => {
    expect(parseGlobalFaqSearch({ page: '3' })).toEqual({ page: 3 });
    for (const page of [1, 0, -2, 2.5, 'two', '']) {
      expect(parseGlobalFaqSearch({ page })).toEqual({});
    }
  });

  test('keeps a trimmed search, cut at the longest one the FAQ runs', () => {
    expect(parseGlobalFaqSearch({ q: ' storm ' })).toEqual({ q: 'storm' });
    expect(parseGlobalFaqSearch({ q: '   ' })).toEqual({});
    expect(parseGlobalFaqSearch({ q: 'a'.repeat(FAQ_CATALOGUE_QUERY_LIMIT + 20) }).q).toHaveLength(
      FAQ_CATALOGUE_QUERY_LIMIT
    );
  });

  test('writes one selection of rulesets one way: sorted, without repeats or anything that is not a slug', () => {
    expect(parseGlobalFaqSearch({ rulesets: 'Dune-2019,advanced,,advanced,no way' })).toEqual({
      rulesets: 'advanced,dune-2019',
    });
    expect(parseGlobalFaqSearch({ rulesets: ['b', 'a'] })).toEqual({ rulesets: 'a,b' });
    expect(parseGlobalFaqSearch({ rulesets: ',' })).toEqual({});
  });

  test('narrows to at most a fixed number of rulesets', () => {
    const many = Array.from({ length: FAQ_SEARCH_RULESET_LIMIT + 5 }, (_, index) => `r${index}`);
    expect(globalFaqRulesetSlugs(parseGlobalFaqSearch({ rulesets: many.join(',') }))).toHaveLength(
      FAQ_SEARCH_RULESET_LIMIT
    );
    expect(globalFaqRulesetSlugs({})).toEqual([]);
  });
});
