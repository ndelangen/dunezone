/*
 * The catalogue's search parameters, apart from the catalogue's search engine.
 * Route search validation runs in the router's entry chunk on every page, so this module must stay free of Fuse.
 */

export type FactionCatalogueSort = 'created' | 'updated' | 'complexity-asc' | 'complexity-desc';

/** The complexity filter as it round-trips through the URL: `"min-max"` on the x/10 scale. */
export type FactionComplexityRange = [number, number];

const FULL_COMPLEXITY_RANGE: FactionComplexityRange = [0, 10];

export type FactionCatalogueSearch = {
  q?: string;
  ruleset?: string;
  sort?: FactionCatalogueSort;
  /** Present only when narrower than the full range. */
  complexity?: string;
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

export function parseFactionCatalogueSearch(params: Record<string, unknown>): FactionCatalogueSearch {
  const q = cleanSearchValue(params.q);
  const ruleset = cleanSearchValue(params.ruleset);
  const sort = isFactionCatalogueSort(params.sort) ? params.sort : undefined;
  const complexity = complexityRangeSearchValue(parseComplexityRange(cleanSearchValue(params.complexity)));

  return {
    ...(q ? { q } : {}),
    ...(ruleset ? { ruleset } : {}),
    ...(sort ? { sort } : {}),
    ...(complexity ? { complexity } : {}),
  };
}

function isFactionCatalogueSort(value: unknown): value is FactionCatalogueSort {
  return value === 'created' || value === 'updated' || value === 'complexity-asc' || value === 'complexity-desc';
}

function cleanSearchValue(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}
