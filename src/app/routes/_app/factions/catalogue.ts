import { parseFactionCatalogueSearch } from '@shared/factions/catalogueSearch';
import type { FactionCatalogueSearch } from '@shared/factions/catalogueSearch';
import { getRouteApi, useLocation } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import type { FactionCatalogueArgs, FactionCatalogueRuleset } from '@db/factions';

const factionCatalogueRoute = getRouteApi('/_app/factions/');

/** How long the search box waits after the last keystroke before the search becomes the page's address. */
const QUERY_COMMIT_DELAY_MS = 300;

/**
 * The page query's arguments for a parsed address, shared by the loader's deps and the live hook so both ask the identical question.
 * Every key is spelled out, `undefined` included, so the loader deps compare equal however the address was written.
 */
export function factionCatalogueArgs(search: FactionCatalogueSearch): FactionCatalogueArgs {
  return {
    q: search.q,
    ruleset: search.ruleset,
    complexity: search.complexity,
    sort: search.sort,
    page: search.page,
  };
}

function normalizeFactionCatalogueSearch(
  search: FactionCatalogueSearch,
  rulesets: FactionCatalogueRuleset[]
): FactionCatalogueSearch {
  const parsed = parseFactionCatalogueSearch(search);
  const validRuleset = rulesets.some((ruleset) => ruleset.slug === parsed.ruleset);
  /* `name` is written out only to override relevance, so without a search it is the default and leaves the address. */
  const sort = parsed.sort === 'name' && !parsed.q ? undefined : parsed.sort;

  return {
    ...(parsed.q ? { q: parsed.q } : {}),
    ...(validRuleset && parsed.ruleset ? { ruleset: parsed.ruleset } : {}),
    ...(sort ? { sort } : {}),
    ...(parsed.complexity ? { complexity: parsed.complexity } : {}),
    ...(parsed.page ? { page: parsed.page } : {}),
  };
}

function factionCatalogueSearchParams(search: FactionCatalogueSearch) {
  const params = new URLSearchParams();
  for (const key of ['q', 'ruleset', 'sort', 'complexity', 'page'] as const) {
    const value = search[key];
    if (value != null) {
      params.set(key, String(value));
    }
  }
  return params;
}

/**
 * Param order must not count as a difference: the router treats an order-only navigate as a structural no-op, so an order-sensitive mismatch would re-fire the canonicalizing effect forever (deep links write params in any order).
 */
function orderIndependentSearchString(params: URLSearchParams) {
  return new URLSearchParams([...params.entries()].sort(([left], [right]) => left.localeCompare(right))).toString();
}

/** The search parameters a change writes: any change but a page turn starts again from the first page. */
function nextSearch(previous: Record<string, unknown>, patch: Partial<Record<keyof FactionCatalogueSearch, unknown>>) {
  return parseFactionCatalogueSearch({ ...previous, page: undefined, ...patch });
}

export function useFactionCatalogueSession(rulesets: FactionCatalogueRuleset[] | undefined) {
  const navigate = factionCatalogueRoute.useNavigate();
  const location = useLocation();
  const search = parseFactionCatalogueSearch(location.search ?? {});
  const rawSearch = location.searchStr;
  const committedQuery = search.q ?? '';
  const [draftQuery, setDraftQuery] = useState(committedQuery);
  const [seededQuery, setSeededQuery] = useState(committedQuery);
  /* Reset during render, the search box's pattern: the URL is the committed value, and a back button
     that restores an older query must not paint the previous one first. */
  if (committedQuery !== seededQuery) {
    setSeededQuery(committedQuery);
    setDraftQuery(committedQuery);
  }

  useEffect(() => {
    if (!rulesets) {
      return;
    }
    const canonical = normalizeFactionCatalogueSearch(search, rulesets);
    const expected = orderIndependentSearchString(factionCatalogueSearchParams(canonical));
    const current = orderIndependentSearchString(new URLSearchParams(rawSearch));
    if (current !== expected) {
      void navigate({ to: '.', search: canonical, replace: true });
    }
  }, [rulesets, navigate, rawSearch, search]);

  const changeSearch = (patch: Partial<Record<keyof FactionCatalogueSearch, unknown>>) => {
    void navigate({ to: '.', search: (previous) => nextSearch(previous, patch), replace: true });
  };
  const commitQuery = () => {
    if (draftQuery.trim() !== committedQuery) {
      changeSearch({ q: draftQuery });
    }
  };

  /* Typing settles into the address after a pause, as Enter and leaving the field already do. */
  useEffect(() => {
    if (draftQuery.trim() === committedQuery) {
      return;
    }
    const timer = setTimeout(
      () => void navigate({ to: '.', search: (previous) => nextSearch(previous, { q: draftQuery }), replace: true }),
      QUERY_COMMIT_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [committedQuery, draftQuery, navigate]);

  return {
    search,
    args: factionCatalogueArgs(search),
    query: {
      value: draftQuery,
      change: setDraftQuery,
      commit: commitQuery,
    },
    changeSearch,
    reset: () => {
      setDraftQuery('');
      changeSearch({ q: undefined, ruleset: undefined, complexity: undefined });
    },
  };
}
