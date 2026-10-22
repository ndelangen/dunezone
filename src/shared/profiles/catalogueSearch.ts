import { parseCataloguePage } from '../factions/catalogueSearch';

/*
 * The `/profiles` page's search parameters, read the same way by the route's URL and by `profiles.catalogue`.
 * Route search validation runs in the router's entry chunk on every page, so this module stays small.
 */

/**
 * The orders a reader can pick while browsing.
 * A search is always best match, so `sort` never travels with `q`;
 * `name` is the default and never written out.
 */
export const PROFILE_CATALOGUE_SORTS = ['name', 'newest'] as const;

export type ProfileCatalogueSort = (typeof PROFILE_CATALOGUE_SORTS)[number];

/** How many profiles one page holds. */
export const PROFILE_CATALOGUE_PAGE_SIZE = 24;

/** The longest search the directory runs; anything past it is cut, since no name is this long. */
export const PROFILE_CATALOGUE_QUERY_LIMIT = 100;

export type ProfileCatalogueSearch = {
  q?: string;
  /** Never alongside `q`: a search is always best match. */
  sort?: ProfileCatalogueSort;
  /** Present only past the first page, so the first page has one address; never alongside `q`, whose matches load more instead of paging. */
  page?: number;
};

function isProfileCatalogueSort(value: unknown): value is ProfileCatalogueSort {
  return (PROFILE_CATALOGUE_SORTS as readonly unknown[]).includes(value);
}

/**
 * Every field is spread conditionally, so an absent key is absent rather than present and undefined, and a default never reaches the address.
 * A search drops the order and the page: its matches come best first and load more in place, so an old link carrying them opens the search's first matches.
 */
export function parseProfileCatalogueSearch(params: Record<string, unknown>): ProfileCatalogueSearch {
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, PROFILE_CATALOGUE_QUERY_LIMIT).trim() : '';
  const parsedSort = isProfileCatalogueSort(params.sort) ? params.sort : undefined;
  const sort = parsedSort === 'name' || q ? undefined : parsedSort;
  const page = q ? undefined : parseCataloguePage(params.page);
  return { ...(q ? { q } : {}), ...(sort ? { sort } : {}), ...(page ? { page } : {}) };
}

/** How many answers or questions one page of a profile's activity holds. */
export const PROFILE_ACTIVITY_PAGE_SIZE = 24;

export type ProfileActivitySearch = {
  /** Present only past the first page, so the first page has one address. */
  page?: number;
};

/** A profile's answers or questions page takes one parameter, the page; spread conditionally so the first page has one address. */
export function parseProfileActivitySearch(params: Record<string, unknown>): ProfileActivitySearch {
  const page = parseCataloguePage(params.page);
  return page ? { page } : {};
}
