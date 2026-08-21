/**
 * The static back a dangling deck reference falls to («What does each back mode publish»): a deployed image rather than a broken link, served beside `logo.svg` as the one other committed web asset.
 * It carries a centred [?] rather than being blank, so a reader can tell "loaded, and wrong" from a failed load («How a dangling back reference presents»).
 * Shared because both sides serve it: the convex resolver hands it out as an href, and the face renderer draws it for the dangling tile the listings mark with `cardback: null`.
 */
export const NO_DECK_BACK_HREF = '/web/no-deck-back.svg';
