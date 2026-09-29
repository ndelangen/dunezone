/** The application's name: the suffix on every browser title, and the home page's whole title. */
export const APP_TITLE = 'Dune Zone';

const SEPARATOR = ' · ';

/**
 * The one browser title grammar: the entity or page name first, then the app, as in "Atreides · Dune Zone".
 * A missing or blank name falls back to the app name alone, so a loader that failed still leaves a sensible tab.
 */
export function pageTitle(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `${trimmed}${SEPARATOR}${APP_TITLE}` : APP_TITLE;
}

/**
 * A route's `head` result carrying that title, so each route states only its name.
 * The deepest matched route's title wins, which is why a detail route can refine its parent's.
 * `noindex` adds the robots tag the play pages carry.
 * `match` is the head context's own match, passed by every route whose loader can throw notFound.
 * The server render and client navigation run no heads below the notFound boundary, but client hydration runs them all.
 * There the throwing match arrives marked `status: 'notFound'` with no loader data, and its fallback name would outrank the `_app` boundary's "Page not found".
 * So a match in that state yields no title at all.
 */
export function pageHead(
  name?: string | null,
  options: { noindex?: boolean; match?: { status: string } } = {}
): { meta?: ({ title: string } | { name: string; content: string })[] } {
  if (options.match?.status === 'notFound') {
    return {};
  }
  return {
    meta: [{ title: pageTitle(name) }, ...(options.noindex ? [{ name: 'robots', content: 'noindex' }] : [])],
  };
}
