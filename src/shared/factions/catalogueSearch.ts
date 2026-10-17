/*
 * The catalogue's search parameters, read the same way by the route's URL and by `factions.catalogue`.
 * Route search validation runs in the router's entry chunk on every page, so this module must stay free of Fuse.
 */

/**
 * The orders a reader can pick.
 * Absent means relevance while searching and `name` otherwise, so `name` is written out only to override relevance.
 */
export const FACTION_CATALOGUE_SORTS = ['name', 'created', 'updated', 'complexity-asc', 'complexity-desc'] as const;

export type FactionCatalogueSort = (typeof FACTION_CATALOGUE_SORTS)[number];

/** How many cards one catalogue page holds. */
export const FACTION_CATALOGUE_PAGE_SIZE = 24;

/** The longest search the catalogue runs; anything past it is cut, since no name is this long. */
export const FACTION_CATALOGUE_QUERY_LIMIT = 100;

/** The complexity filter as it round-trips through the URL: `"min-max"` on the x/10 scale. */
export type FactionComplexityRange = [number, number];

const FULL_COMPLEXITY_RANGE: FactionComplexityRange = [0, 10];

export type FactionCatalogueSearch = {
  q?: string;
  ruleset?: string;
  sort?: FactionCatalogueSort;
  /** Present only when narrower than the full range. */
  complexity?: string;
  /** Present only past the first page, so the first page has one address. */
  page?: number;
};

export function parseComplexityRange(value: string | undefined): FactionComplexityRange {
  const match = /^([0-9]|10)-([0-9]|10)$/.exec(value ?? '');
  if (!match) {
    return FULL_COMPLEXITY_RANGE;
  }
  const low = Number(match[1]);
  const high = Number(match[2]);
  return low <= high ? [low, high] : FULL_COMPLEXITY_RANGE;
}

export function complexityRangeSearchValue(range: FactionComplexityRange): string | undefined {
  const [low, high] = range;
  if (low <= 0 && high >= 10) {
    return undefined;
  }
  return `${low}-${high}`;
}

/** A page number as the URL may carry it: a whole number from 2 up, or nothing, which means the first page. */
export function parseCataloguePage(value: unknown): number | undefined {
  const page = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof page === 'number' && Number.isSafeInteger(page) && page > 1 ? page : undefined;
}

export function parseFactionCatalogueSearch(params: Record<string, unknown>): FactionCatalogueSearch {
  const q = cleanSearchValue(params.q)?.slice(0, FACTION_CATALOGUE_QUERY_LIMIT).trim();
  const ruleset = cleanSearchValue(params.ruleset);
  const sort = isFactionCatalogueSort(params.sort) ? params.sort : undefined;
  const complexity = complexityRangeSearchValue(parseComplexityRange(cleanSearchValue(params.complexity)));
  const page = parseCataloguePage(params.page);

  return {
    ...(q ? { q } : {}),
    ...(ruleset ? { ruleset } : {}),
    ...(sort ? { sort } : {}),
    ...(complexity ? { complexity } : {}),
    ...(page ? { page } : {}),
  };
}

function isFactionCatalogueSort(value: unknown): value is FactionCatalogueSort {
  return (FACTION_CATALOGUE_SORTS as readonly unknown[]).includes(value);
}

function cleanSearchValue(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}
