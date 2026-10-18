import { parseFactionCatalogueSearch } from '@shared/factions/catalogueSearch';
import type { FactionCatalogueSearch } from '@shared/factions/catalogueSearch';
import { getRouteApi, useLocation, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';

import type { FactionCatalogueArgs, FactionCatalogueRuleset } from '@db/factions';
import { useSearchDraft } from '@app/routes/searchDraft';

const factionCatalogueRoute = getRouteApi('/_app/factions/');

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
  /* The parser already drops the default order, and the order and page of a search; only the ruleset needs the live list to judge. */
  const { ruleset, ...parsed } = parseFactionCatalogueSearch(search);
  const validRuleset = rulesets.some((candidate) => candidate.slug === ruleset);
  return validRuleset && ruleset ? { ...parsed, ruleset } : parsed;
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
  const router = useRouter();
  const location = useLocation();
  const search = parseFactionCatalogueSearch(location.search ?? {});
  const rawSearch = location.searchStr;
  const commitQuery = useCallback(
    (q: string) => void navigate({ to: '.', search: (previous) => nextSearch(previous, { q }), replace: true }),
    [navigate]
  );
  const query = useSearchDraft(search.q ?? '', commitQuery);

  useEffect(() => {
    if (!rulesets) {
      return;
    }
    const canonical = normalizeFactionCatalogueSearch(search, rulesets);
    /* Written by the router's own serializer, so a value it quotes (a search for "123") compares as the address it writes. */
    const expected = orderIndependentSearchString(new URLSearchParams(router.options.stringifySearch(canonical)));
    const current = orderIndependentSearchString(new URLSearchParams(rawSearch));
    if (current !== expected) {
      void navigate({ to: '.', search: canonical, replace: true });
    }
  }, [rulesets, navigate, rawSearch, search, router]);

  const changeSearch = (patch: Partial<Record<keyof FactionCatalogueSearch, unknown>>) => {
    void navigate({ to: '.', search: (previous) => nextSearch(previous, patch), replace: true });
  };

  return {
    search,
    args: factionCatalogueArgs(search),
    query,
    changeSearch,
    reset: () => {
      query.change('');
      changeSearch({ q: undefined, ruleset: undefined, complexity: undefined });
    },
  };
}
