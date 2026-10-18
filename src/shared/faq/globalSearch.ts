import { parseCataloguePage } from '../factions/catalogueSearch';
import { FAQ_CATALOGUE_QUERY_LIMIT } from './catalogueSearch';

/*
 * The global FAQ page's search parameters, read the same way by the `/faq` route's URL and by `faq.search`.
 * Route search validation runs in the router's entry chunk on every page, so this module stays small.
 */

/** The most rulesets one search narrows to; a longer list keeps its first ones. */
export const FAQ_SEARCH_RULESET_LIMIT = 20;

export type GlobalFaqSearch = {
  q?: string;
  /** The rulesets searched, as slugs joined by commas, sorted so one selection has one address; absent searches every ruleset. */
  rulesets?: string;
  /** Present only past the first page, so the first page has one address. */
  page?: number;
};

/* A slug is lowercase letters, digits and dashes, so a comma never appears in one. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function slugList(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const slugs = parts
    .filter((part): part is string => typeof part === 'string')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => SLUG.test(part));
  return [...new Set(slugs)].sort().slice(0, FAQ_SEARCH_RULESET_LIMIT);
}

/** The ruleset slugs a parsed search narrows to, empty for every ruleset. */
export function globalFaqRulesetSlugs(search: GlobalFaqSearch): string[] {
  return search.rulesets ? search.rulesets.split(',') : [];
}

/** Every field is spread conditionally, so an absent key is absent rather than present and undefined, and a default never reaches the address. */
export function parseGlobalFaqSearch(params: Record<string, unknown>): GlobalFaqSearch {
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, FAQ_CATALOGUE_QUERY_LIMIT).trim() : '';
  const rulesets = slugList(params.rulesets).join(',');
  const page = parseCataloguePage(params.page);
  return { ...(q ? { q } : {}), ...(rulesets ? { rulesets } : {}), ...(page ? { page } : {}) };
}
