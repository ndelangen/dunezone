import { getRouteApi, useLocation } from '@tanstack/react-router';
import { complexityOutOfTen, effectiveComplexity } from '@ui/content/complexity';
import Fuse from 'fuse.js';
import { useEffect, useState } from 'react';

import type {
  FactionCatalogueEntry,
  FactionCataloguePageData,
  FactionRulesetSummary,
} from '@db/factions';

const factionCatalogueRoute = getRouteApi('/_app/factions/');

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

export function parseFactionCatalogueSearch(
  params: Record<string, unknown>
): FactionCatalogueSearch {
  const q = cleanSearchValue(params.q);
  const ruleset = cleanSearchValue(params.ruleset);
  const sort = isFactionCatalogueSort(params.sort) ? params.sort : undefined;
  const complexity = complexityRangeSearchValue(
    parseComplexityRange(cleanSearchValue(params.complexity))
  );

  return {
    ...(q ? { q } : {}),
    ...(ruleset ? { ruleset } : {}),
    ...(sort ? { sort } : {}),
    ...(complexity ? { complexity } : {}),
  };
}

function normalizeFactionCatalogueSearch(
  search: FactionCatalogueSearch,
  rulesets: FactionRulesetSummary[]
): FactionCatalogueSearch {
  const parsed = parseFactionCatalogueSearch(search);
  const validRuleset = rulesets.some((ruleset) => ruleset.slug === parsed.ruleset);

  return {
    ...(parsed.q ? { q: parsed.q } : {}),
    ...(validRuleset && parsed.ruleset ? { ruleset: parsed.ruleset } : {}),
    ...(parsed.sort ? { sort: parsed.sort } : {}),
    ...(parsed.complexity ? { complexity: parsed.complexity } : {}),
  };
}

function factionCatalogueSearchParams(search: FactionCatalogueSearch) {
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
  if (search.complexity) {
    params.set('complexity', search.complexity);
  }
  return params;
}

/**
 * Param order must not count as a difference: the router treats an order-only navigate as a
 * structural no-op, so an order-sensitive mismatch would re-fire the canonicalizing effect forever
 * (deep links write params in any order).
 */
function orderIndependentSearchString(params: URLSearchParams) {
  return new URLSearchParams(
    [...params.entries()].sort(([left], [right]) => left.localeCompare(right))
  ).toString();
}

export function projectFactionCatalogue(
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

  const [low, high] = parseComplexityRange(search.complexity);
  const rangeNarrows = low > 0 || high < 10;
  const complexitySorted = search.sort === 'complexity-asc' || search.sort === 'complexity-desc';
  /* Scored once per projection — filtering and sorting share it instead of recounting rules text. */
  const scores =
    rangeNarrows || complexitySorted
      ? new Map(rulesetMatches.map((faction) => [faction, effectiveComplexity(faction.data)]))
      : null;

  const complexityMatches =
    rangeNarrows && scores
      ? rulesetMatches.filter((faction) => {
          const score = complexityOutOfTen(scores.get(faction) ?? 0);
          return score >= low && score <= high;
        })
      : rulesetMatches;

  const matches = query
    ? new Fuse(complexityMatches, {
        keys: ['data.name', 'data.hero.name', 'data.leaders.name'],
        ignoreLocation: true,
        threshold: 0.35,
      })
        .search(query)
        .map((result) => result.item)
    : complexityMatches;

  if (complexitySorted && scores) {
    const direction = search.sort === 'complexity-asc' ? 1 : -1;
    return matches.sort(
      (left, right) =>
        ((scores.get(left) ?? 0) - (scores.get(right) ?? 0)) * direction ||
        compareIdentity(left, right)
    );
  }
  return matches.sort((left, right) => compareFactions(left, right, search.sort));
}

function isFactionCatalogueSort(value: unknown): value is FactionCatalogueSort {
  return (
    value === 'created' ||
    value === 'updated' ||
    value === 'complexity-asc' ||
    value === 'complexity-desc'
  );
}

export function useFactionCatalogueSession(
  data: Pick<FactionCataloguePageData, 'factions' | 'rulesets'> | undefined
) {
  const navigate = factionCatalogueRoute.useNavigate();
  const location = useLocation();
  const search = parseFactionCatalogueSearch(location.search ?? {});
  const rawSearch = location.searchStr;
  const [draftQuery, setDraftQuery] = useState(search.q ?? '');

  useEffect(() => setDraftQuery(search.q ?? ''), [search.q]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const canonical = normalizeFactionCatalogueSearch(search, data.rulesets);
    const expected = orderIndependentSearchString(factionCatalogueSearchParams(canonical));
    const current = orderIndependentSearchString(new URLSearchParams(rawSearch));
    if (current !== expected) {
      void navigate({ to: '.', search: canonical, replace: true });
    }
  }, [data, navigate, rawSearch, search]);

  const changeSearch = (patch: Partial<Record<keyof FactionCatalogueSearch, unknown>>) => {
    void navigate({
      to: '.',
      search: (previous) => parseFactionCatalogueSearch({ ...previous, ...patch }),
      replace: true,
    });
  };

  return {
    search,
    query: {
      value: draftQuery,
      change: setDraftQuery,
      commit: () => changeSearch({ q: draftQuery }),
    },
    visibleFactions: data ? projectFactionCatalogue(data.factions, search, draftQuery) : [],
    changeSearch,
    reset: () => {
      setDraftQuery('');
      changeSearch({ q: undefined, ruleset: undefined, complexity: undefined });
    },
  };
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
