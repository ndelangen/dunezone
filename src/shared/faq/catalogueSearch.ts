import { parseCataloguePage } from '../factions/catalogueSearch';
import { FAQ_TAG_VALUES } from './tags';
import type { FaqTag } from './tags';

/*
 * A ruleset's FAQ page's search parameters, read the same way by the route's URL and by `faq.rulesetFaq`.
 * Route search validation runs in the router's entry chunk on every page, so this module stays small.
 */

/** How many questions one page holds. */
export const FAQ_CATALOGUE_PAGE_SIZE = 24;

/** How many of the newest questions the ruleset's own page shows before linking to the rest. */
export const FAQ_PREVIEW_SIZE = 5;

/** The longest search the FAQ runs; anything past it is cut. */
export const FAQ_CATALOGUE_QUERY_LIMIT = 200;

export type FaqCatalogueSearch = {
  q?: string;
  tag?: FaqTag;
  /** Present only past the first page, so the first page has one address. */
  page?: number;
};

function isFaqTag(value: unknown): value is FaqTag {
  return (FAQ_TAG_VALUES as readonly unknown[]).includes(value);
}

/** Every field is spread conditionally, so an absent key is absent rather than present and undefined, and a default never reaches the address. */
export function parseFaqCatalogueSearch(params: Record<string, unknown>): FaqCatalogueSearch {
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, FAQ_CATALOGUE_QUERY_LIMIT).trim() : '';
  const tag = isFaqTag(params.tag) ? params.tag : undefined;
  const page = parseCataloguePage(params.page);
  return { ...(q ? { q } : {}), ...(tag ? { tag } : {}), ...(page ? { page } : {}) };
}
