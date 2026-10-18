import { parseCataloguePage } from '../factions/catalogueSearch';

/*
 * The `/assets/{type}` page's search parameters, read the same way by the route's URL and by `assets.catalogue`.
 * Route search validation runs in the router's entry chunk on every page, so this module stays small.
 */

/**
 * The orders a reader can pick.
 * Absent means best match while searching and newest first otherwise, so `newest` is written out only to override best match.
 */
export const ASSET_CATALOGUE_SORTS = ['newest', 'updated', 'name'] as const;

export type AssetCatalogueSort = (typeof ASSET_CATALOGUE_SORTS)[number];

/** How many tiles one page holds. */
export const ASSET_CATALOGUE_PAGE_SIZE = 24;

/** The longest search the catalogue runs; anything past it is cut, since no name is this long. */
export const ASSET_CATALOGUE_QUERY_LIMIT = 100;

export type AssetCatalogueSearch = {
  q?: string;
  sort?: AssetCatalogueSort;
  /** Present only past the first page, so the first page has one address. */
  page?: number;
};

function isAssetCatalogueSort(value: unknown): value is AssetCatalogueSort {
  return (ASSET_CATALOGUE_SORTS as readonly unknown[]).includes(value);
}

/**
 * Every field is spread conditionally, so an absent key is absent rather than present and undefined, and a default never reaches the address.
 * `newest` is the default without a search, so it is kept only alongside one.
 */
export function parseAssetCatalogueSearch(params: Record<string, unknown>): AssetCatalogueSearch {
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, ASSET_CATALOGUE_QUERY_LIMIT).trim() : '';
  const parsedSort = isAssetCatalogueSort(params.sort) ? params.sort : undefined;
  const sort = parsedSort === 'newest' && !q ? undefined : parsedSort;
  const page = parseCataloguePage(params.page);
  return { ...(q ? { q } : {}), ...(sort ? { sort } : {}), ...(page ? { page } : {}) };
}
