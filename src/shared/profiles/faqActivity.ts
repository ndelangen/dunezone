import { parseCataloguePage } from '../factions/catalogueSearch';

/** Profile activity uses the same question rows as other FAQ lists, one bounded page at a time. */
export const PROFILE_FAQ_PAGE_SIZE = 24;

export type ProfileFaqPages = { askedPage?: number; answeredPage?: number };

/** The first page needs no parameter; invalid addresses open that first page. */
export function parseProfileFaqPages(params: Record<string, unknown>): ProfileFaqPages {
  const askedPage = parseCataloguePage(params.askedPage);
  const answeredPage = parseCataloguePage(params.answeredPage);
  return { ...(askedPage ? { askedPage } : {}), ...(answeredPage ? { answeredPage } : {}) };
}
