import { parseFactionCatalogueSearch } from '@shared/factions/catalogueSearch';
import type { FactionCatalogueSearch } from '@shared/factions/catalogueSearch';
import { getRouteApi, useLocation, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';

import type { FactionCatalogueArgs, FactionCatalogueOwner, FactionCatalogueRuleset } from '@db/factions';
import { useSearchDraft } from '@app/routes/searchDraft';

const factionCatalogueRoute = getRouteApi('/_app/factions/');

/**
 * The page query's arguments for an address, shared by the loader's deps and the live hook so both ask the identical question.
 * Parsed again here, since the router keeps a parameter the parser dropped, such as an old link's page beside a search;
 * every key is spelled out, `undefined` included, so the loader deps compare equal however the address was written.
 */
export function factionCatalogueArgs(search: FactionCatalogueSearch): FactionCatalogueArgs {
  const parsed = parseFactionCatalogueSearch(search);
  return {
    q: parsed.q,
    ruleset: parsed.ruleset,
    owner: parsed.owner,
    complexity: parsed.complexity,
    sort: parsed.sort,
    page: parsed.page,
  };
}

function normalizeFactionCatalogueSearch(
  search: FactionCatalogueSearch,
  rulesets: FactionCatalogueRuleset[],
  owner: FactionCatalogueOwner
): FactionCatalogueSearch {
  /* The parser already drops the default order, and the order and page of a search; the ruleset and the member need the live answer to judge. */
  const { ruleset, owner: ownerSlug, ...parsed } = parseFactionCatalogueSearch(search);
  const validRuleset = rulesets.some((candidate) => candidate.slug === ruleset);
  /* The server names the member it narrowed to; a slug it did not know narrowed nothing and leaves the address. */
  const validOwner = owner != null && owner.slug === ownerSlug;
  return {
    ...parsed,
    ...(validRuleset && ruleset ? { ruleset } : {}),
    ...(validOwner && ownerSlug ? { owner: ownerSlug } : {}),
  };
}

/**
 * Param order must not count as a difference: the router treats an order-only navigate as a structural no-op, so an order-sensitive mismatch would re-fire the canonicalizing effect forever (deep links write params in any order).
 */
function orderIndependentSearchString(params: URLSearchParams) {
  return new URLSearchParams([...params.entries()].sort(([left], [right]) => left.localeCompare(right))).toString();
}

/**
 * The search parameters a change writes: any change but a page turn starts again from the first page.
 * A list is one partition, so choosing a ruleset leaves the member's list;
 * the parser would drop the ruleset otherwise.
 */
function nextSearch(previous: Record<string, unknown>, patch: Partial<Record<keyof FactionCatalogueSearch, unknown>>) {
  return parseFactionCatalogueSearch({
    ...previous,
    page: undefined,
    ...('ruleset' in patch ? { owner: undefined } : {}),
    ...patch,
  });
}

export function useFactionCatalogueSession(
  rulesets: FactionCatalogueRuleset[] | undefined,
  owner: FactionCatalogueOwner | undefined
) {
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
    if (!rulesets || owner === undefined) {
      return;
    }
    const canonical = normalizeFactionCatalogueSearch(search, rulesets, owner);
    /* Written by the router's own serializer, so a value it quotes (a search for "123") compares as the address it writes. */
    const expected = orderIndependentSearchString(new URLSearchParams(router.options.stringifySearch(canonical)));
    const current = orderIndependentSearchString(new URLSearchParams(rawSearch));
    if (current !== expected) {
      void navigate({ to: '.', search: canonical, replace: true });
    }
  }, [rulesets, owner, navigate, rawSearch, search, router]);

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
      changeSearch({ q: undefined, ruleset: undefined, owner: undefined, complexity: undefined });
    },
  };
}
