/** The cover fields a ruleset row carries, named structurally so both sides can pass their own row type. */
export type RulesetCoverSource = {
  cover?: { thumb_url: string; url: string } | null;
  image_cover: string | null;
};

/**
 * The one URL anything renders for a ruleset's cover thumb: the stored thumb, then the stored full image, then the legacy hot-link.
 *
 * Shared rather than duplicated because both sides need it and only one of them may own it.
 * A Convex query folds it into the flat field it sends, the way a profile summary folds an avatar, and the client derives the same value for callers holding a whole row.
 * When the legacy `image_cover` is finally retired, this function and the queries calling it are the whole of the change;
 * no shape on the wire mentions it.
 */
export function rulesetCoverThumbUrl(row: RulesetCoverSource): string | null {
  return row.cover?.thumb_url ?? row.cover?.url ?? row.image_cover;
}
