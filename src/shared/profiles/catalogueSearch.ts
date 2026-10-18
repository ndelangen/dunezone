import { parseCataloguePage } from '../factions/catalogueSearch';

/*
 * The `/profiles` page's search parameters, read the same way by the route's URL and by `profiles.catalogue`.
 * Route search validation runs in the router's entry chunk on every page, so this module stays small.
 */

/**
 * The orders a reader can pick.
 * Absent means best match while searching and A to Z otherwise, so `name` is written out only to override best match.
 */
export const PROFILE_CATALOGUE_SORTS = ['name', 'newest'] as const;

export type ProfileCatalogueSort = (typeof PROFILE_CATALOGUE_SORTS)[number];

/** How many profiles one page holds. */
export const PROFILE_CATALOGUE_PAGE_SIZE = 24;

/** The longest search the directory runs; anything past it is cut, since no name is this long. */
export const PROFILE_CATALOGUE_QUERY_LIMIT = 100;

export type ProfileCatalogueSearch = {
  q?: string;
  sort?: ProfileCatalogueSort;
  /** Present only past the first page, so the first page has one address. */
  page?: number;
};

function isProfileCatalogueSort(value: unknown): value is ProfileCatalogueSort {
  return (PROFILE_CATALOGUE_SORTS as readonly unknown[]).includes(value);
}

/**
 * Every field is spread conditionally, so an absent key is absent rather than present and undefined, and a default never reaches the address.
 * `name` is the default without a search, so it is kept only alongside one.
 */
export function parseProfileCatalogueSearch(params: Record<string, unknown>): ProfileCatalogueSearch {
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, PROFILE_CATALOGUE_QUERY_LIMIT).trim() : '';
  const parsedSort = isProfileCatalogueSort(params.sort) ? params.sort : undefined;
  const sort = parsedSort === 'name' && !q ? undefined : parsedSort;
  const page = parseCataloguePage(params.page);
  return { ...(q ? { q } : {}), ...(sort ? { sort } : {}), ...(page ? { page } : {}) };
}
