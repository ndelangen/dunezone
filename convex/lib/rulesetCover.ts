import { v } from 'convex/values';
import type { Infer } from 'convex/values';

/**
 * The stored-cover shape, defined once so the schema field and the rehost mutation arguments cannot drift.
 * `url` is our delivery URL over the full re-encoded rendition and `thumb_url` over the grid-sized one;
 * `source_url` is what the author pasted, kept for provenance and for prefilling the edit form.
 * `width` and `height` describe the full rendition.
 */
export const rulesetCoverValidator = v.object({
  url: v.string(),
  thumb_url: v.string(),
  source_url: v.string(),
  width: v.number(),
  height: v.number(),
});

export type RulesetCover = Infer<typeof rulesetCoverValidator>;
