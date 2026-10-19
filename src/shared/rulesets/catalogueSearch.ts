import { parseCataloguePage } from '../factions/catalogueSearch';

/*
 * The `/rulesets` page's search parameters, read the same way by the route's URL and by `rulesets.catalogue`.
 * Route search validation runs in the router's entry chunk on every page, so this module stays small.
 */

/**
 * The orders a reader can pick while browsing.
 * A search is always best match, so `sort` never travels with `q`;
 * `name` is the default and never written out.
 */
export const RULESET_CATALOGUE_SORTS = ['name', 'newest'] as const;

export type RulesetCatalogueSort = (typeof RULESET_CATALOGUE_SORTS)[number];

/** How many rulesets one page holds. */
export const RULESET_CATALOGUE_PAGE_SIZE = 24;

/** The longest search the catalogue runs; anything past it is cut, since no name is this long. */
export const RULESET_CATALOGUE_QUERY_LIMIT = 100;

export type RulesetCatalogueSearch = {
  q?: string;
  /** Never alongside `q`: a search is always best match. */
  sort?: RulesetCatalogueSort;
  /** Present only past the first page, so the first page has one address; never alongside `q`, whose matches load more instead of paging. */
  page?: number;
};

function isRulesetCatalogueSort(value: unknown): value is RulesetCatalogueSort {
  return (RULESET_CATALOGUE_SORTS as readonly unknown[]).includes(value);
}

/** The search as the catalogue runs it: trimmed and cut to the longest one; empty when nothing is searched. */
function searchText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, RULESET_CATALOGUE_QUERY_LIMIT).trim() : '';
}

/** The order a browsed address carries: never the default, and never beside a search. */
function browseSort(value: unknown, q: string): RulesetCatalogueSort | undefined {
  const sort = isRulesetCatalogueSort(value) ? value : undefined;
  return sort === 'name' || q ? undefined : sort;
}

/** The page a browsed address carries: never beside a search, whose matches load more instead of paging. */
function browsePage(value: unknown, q: string): number | undefined {
  return q ? undefined : parseCataloguePage(value);
}

/**
 * Every field is spread conditionally, so an absent key is absent rather than present and undefined, and a default never reaches the address.
 * A search drops the order and the page: its matches come best first and load more in place, so an old link carrying them opens the search's first matches.
 */
export function parseRulesetCatalogueSearch(params: Record<string, unknown>): RulesetCatalogueSearch {
  const q = searchText(params.q);
  const sort = browseSort(params.sort, q);
  const page = browsePage(params.page, q);
  return { ...(q ? { q } : {}), ...(sort ? { sort } : {}), ...(page ? { page } : {}) };
}
