import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../types';
import { nowIso } from './utils';

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

/**
 * The one way a stored cover lands on a ruleset row, shared by the author commit, the backfill commit and the ledger consume.
 * `image_cover` is dual-written with the delivery URL so pre-rehost bundles keep rendering during the compatibility window.
 */
export async function patchStoredCover(
  ctx: MutationCtx,
  id: Doc<'rulesets'>['_id'],
  cover: RulesetCover
): Promise<void> {
  await ctx.db.patch(id, {
    cover,
    image_cover: cover.url,
    updated_at: nowIso(),
  });
}
