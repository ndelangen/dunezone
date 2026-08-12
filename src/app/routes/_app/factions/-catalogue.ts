import { getRouteApi, useLocation } from '@tanstack/react-router';
import Fuse from 'fuse.js';
import { useEffect, useState } from 'react';

import type {
  FactionCatalogueEntry,
  FactionCataloguePageData,
  FactionRulesetSummary,
} from '@db/factions';

const factionCatalogueRoute = getRouteApi('/_app/factions/');

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
  return params;
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

function isFactionCatalogueSort(value: unknown): value is FactionCatalogueSort {
  return value === 'created' || value === 'updated';
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
    const expected = factionCatalogueSearchParams(canonical).toString();
    const current = new URLSearchParams(rawSearch).toString();
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
      changeSearch({ q: undefined, ruleset: undefined });
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
