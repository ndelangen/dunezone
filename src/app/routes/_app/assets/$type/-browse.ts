import type { AssetBrowseEntry } from '@app/db/assets';

/**
 * The browse page's URL state.
 *
 * `newest` is the default sort and therefore has **no representable value**, the way `name` is absent from the faction catalogue's sort union: absence is the default, so a clean URL stays clean and there is one spelling per state.
 * `deck` is present only when engaged, for the same reason.
 * Its only meaningful state is on, so it encodes as presence rather than as `?deck=all`.
 */
type AssetBrowseSort = 'name' | 'owner' | 'most-used';

export type AssetBrowseSearch = {
  q?: string;
  sort?: AssetBrowseSort;
  deck?: 'none';
};

const SORT_VALUES: readonly AssetBrowseSort[] = ['name', 'owner', 'most-used'];

/** The sort control's options. `newest` leads because it is what the query already returns. */
export const ASSET_BROWSE_SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name' },
  { value: 'owner', label: 'Owner' },
  { value: 'most-used', label: 'Most used' },
];

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanSort(value: unknown): AssetBrowseSort | undefined {
  return SORT_VALUES.find((sort) => sort === value);
}

/**
 * Every field is spread conditionally, so an absent key is absent rather than present and undefined.
 * That is what keeps `?sort=newest` and `?q=` from ever reaching the URL.
 */
export function parseAssetBrowseSearch(input: Record<string, unknown>): AssetBrowseSearch {
  const q = cleanText(input.q);
  const sort = cleanSort(input.sort);
  const deck = input.deck === 'none' ? ('none' as const) : undefined;
  return { ...(q ? { q } : {}), ...(sort ? { sort } : {}), ...(deck ? { deck } : {}) };
}

/** Case-insensitive over the two facts a tile shows, which are the two a reader can see to search by. */
function matchesQuery(entry: AssetBrowseEntry, query: string): boolean {
  const needle = query.toLowerCase();
  return entry.name.toLowerCase().includes(needle) || (entry.owner?.username ?? '').toLowerCase().includes(needle);
}

/**
 * Applies the URL state to the page the query returned.
 *
 * All of it runs here rather than in Convex: three of the four sorts cannot be an index, since `name` lives inside an untyped blob, `owner` lives in another table and `deckCount` is derived, so sorting server-side would fork the subscription per sort to buy consistency in one case out of four.
 * The set is bounded by the query, which is what makes that affordable.
 */
export function applyAssetBrowseSearch(
  entries: readonly AssetBrowseEntry[],
  search: AssetBrowseSearch
): AssetBrowseEntry[] {
  const filtered = entries.filter((entry) => {
    if (search.deck === 'none' && entry.deckCount !== 0) {
      return false;
    }
    return search.q ? matchesQuery(entry, search.q) : true;
  });

  switch (search.sort) {
    case 'name':
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    case 'owner':
      return [...filtered].sort(
        (a, b) => (a.owner?.username ?? '').localeCompare(b.owner?.username ?? '') || a.name.localeCompare(b.name)
      );
    case 'most-used':
      return [...filtered].sort((a, b) => b.deckCount - a.deckCount || a.name.localeCompare(b.name));
    default:
      /* The query already returns newest first, so the default sort is the absence of one. */
      return filtered;
  }
}
