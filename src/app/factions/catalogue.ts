import Fuse from 'fuse.js';

import type { FactionCatalogueEntry, FactionRulesetSummary } from '@db/factions';

export type FactionCatalogueSort = 'created' | 'updated';

export type FactionCatalogueSearch = {
  q?: string;
  ruleset?: string;
  sort?: FactionCatalogueSort;
};

export function parseFactionCatalogueSearch(
  params: Record<string, unknown>
): FactionCatalogueSearch {
  const q = cleanSearchValue(params.q);
  const ruleset = cleanSearchValue(params.ruleset);
  const sort = isFactionCatalogueSort(params.sort) ? params.sort : undefined;

  return {
    ...(q ? { q } : {}),
    ...(ruleset ? { ruleset } : {}),
    ...(sort ? { sort } : {}),
  };
}

export function normalizeFactionCatalogueSearch(
  search: FactionCatalogueSearch,
  rulesets: FactionRulesetSummary[]
): FactionCatalogueSearch {
  const parsed = parseFactionCatalogueSearch(search);
  const validRuleset = rulesets.some((ruleset) => ruleset.slug === parsed.ruleset);

  return {
    ...(parsed.q ? { q: parsed.q } : {}),
    ...(validRuleset && parsed.ruleset ? { ruleset: parsed.ruleset } : {}),
    ...(parsed.sort ? { sort: parsed.sort } : {}),
  };
}

export function factionCatalogueSearchParams(search: FactionCatalogueSearch) {
  const params = new URLSearchParams();
  if (search.q) {
    params.set('q', search.q);
  }
  if (search.ruleset) {
    params.set('ruleset', search.ruleset);
  }
  if (search.sort) {
    params.set('sort', search.sort);
  }
  return params;
}

export function filterAndSortFactions(
  factions: FactionCatalogueEntry[],
  search: FactionCatalogueSearch,
  draftQuery = search.q ?? ''
) {
  const query = draftQuery.trim();
  const rulesetMatches = search.ruleset
    ? factions.filter((faction) =>
        faction.rulesets.some((ruleset) => ruleset.slug === search.ruleset)
      )
    : [...factions];

  const matches = query
    ? new Fuse(rulesetMatches, {
        keys: ['data.name', 'data.hero.name', 'data.leaders.name'],
        ignoreLocation: true,
        threshold: 0.35,
      })
        .search(query)
        .map((result) => result.item)
    : rulesetMatches;

  return matches.sort((left, right) => compareFactions(left, right, search.sort));
}

export function isFactionCatalogueSort(value: unknown): value is FactionCatalogueSort {
  return value === 'created' || value === 'updated';
}

function compareFactions(
  left: FactionCatalogueEntry,
  right: FactionCatalogueEntry,
  sort: FactionCatalogueSort | undefined
) {
  if (sort === 'created') {
    return compareDateDescending(left, right, 'created_at');
  }
  if (sort === 'updated') {
    return compareDateDescending(left, right, 'updated_at');
  }
  return compareIdentity(left, right);
}

function compareDateDescending(
  left: FactionCatalogueEntry,
  right: FactionCatalogueEntry,
  field: 'created_at' | 'updated_at'
) {
  const leftTimestamp = parseTimestamp(left[field]);
  const rightTimestamp = parseTimestamp(right[field]);
  if (leftTimestamp == null && rightTimestamp == null) {
    return compareIdentity(left, right);
  }
  if (leftTimestamp == null) {
    return 1;
  }
  if (rightTimestamp == null) {
    return -1;
  }
  return rightTimestamp - leftTimestamp || compareIdentity(left, right);
}

function compareIdentity(left: FactionCatalogueEntry, right: FactionCatalogueEntry) {
  return (
    left.data.name.localeCompare(right.data.name) ||
    String(left._id).localeCompare(String(right._id))
  );
}

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function cleanSearchValue(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}
