import type { AssetBrowseEntry } from '@app/db/assets';

/**
 * The browse page's URL state.
 *
 * `newest` is the default sort and therefore has **no representable value**, the way `name` is absent from the faction catalogue's sort union: absence is the default, so a clean URL stays clean and there is one spelling per state.
 */
type AssetBrowseSort = 'updated' | 'name';

export type AssetBrowseSearch = {
  q?: string;
  sort?: AssetBrowseSort;
};

const SORT_VALUES: readonly AssetBrowseSort[] = ['updated', 'name'];

/** The sort control's options. `newest` leads because it is what the query already returns. */
export const ASSET_BROWSE_SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name' },
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
  return { ...(q ? { q } : {}), ...(sort ? { sort } : {}) };
}

/** Case-insensitive over the name on the tile and the owner behind it, so a reader can find their own work. */
function matchesQuery(entry: AssetBrowseEntry, query: string): boolean {
  const needle = query.toLowerCase();
  return entry.name.toLowerCase().includes(needle) || (entry.owner?.username ?? '').toLowerCase().includes(needle);
}

/**
 * Applies the URL state to the page the query returned.
 *
 * All of it runs here rather than in Convex: `name` lives inside an untyped blob and `updated_at` has no index, so sorting server-side would fork the subscription per sort to buy consistency in one case.
 * The set is bounded by the query, which is what makes that affordable.
 */
export function applyAssetBrowseSearch(
  entries: readonly AssetBrowseEntry[],
  search: AssetBrowseSearch
): AssetBrowseEntry[] {
  const query = search.q;
  const filtered = query ? entries.filter((entry) => matchesQuery(entry, query)) : [...entries];

  switch (search.sort) {
    case 'name':
      return filtered.sort((a, b) => a.name.localeCompare(b.name));
    case 'updated':
      return filtered.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.name.localeCompare(b.name));
    default:
      /* The query already returns newest first, so the default sort is the absence of one. */
      return filtered;
  }
}
