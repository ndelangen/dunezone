/**
 * The static back a dangling deck reference falls to («What does each back mode publish»): a deployed image rather than a broken link, served beside `logo.svg` as the one other committed web asset.
 * It carries a centred [?] rather than being blank, so a reader can tell "loaded, and wrong" from a failed load («How a dangling back reference presents»).
 * The Convex resolvers are its only source: a dangling deck's listing `previewHref` and its detail page's `resolvedBack` both hand out this href, and a client draws it like any other publication.
 */
export const NO_DECK_BACK_HREF = '/web/no-deck-back.svg';
