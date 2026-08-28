import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../types';
import { nowIso } from './utils';

/**
 * The stored-avatar shape, defined once so the schema field and the rehost pipeline cannot drift.
 * `url` is our delivery URL over the one square rendition;
 * `source_url` is the external URL the rehost fetched, kept for provenance.
 * `width` and `height` describe the rendition and are equal by construction.
 */
export const profileAvatarValidator = v.object({
  url: v.string(),
  source_url: v.string(),
  width: v.number(),
  height: v.number(),
});

export type ProfileAvatar = Infer<typeof profileAvatarValidator>;

/**
 * The one way a stored avatar lands on a profile row, called only by the ledger consume.
 * `avatar_url` is dual-written with the delivery URL so pre-rehost readers keep rendering during the compatibility window.
 */
export async function patchStoredAvatar(
  ctx: MutationCtx,
  id: Doc<'profiles'>['_id'],
  avatar: ProfileAvatar
): Promise<void> {
  await ctx.db.patch(id, {
    avatar,
    avatar_url: avatar.url,
    updated_at: nowIso(),
  });
}

/**
 * Schedules the async rehost for a profile still carrying an external avatar URL.
 * The scheduling commits with the calling mutation, so a rolled-back save never fires a fetch.
 * A row whose avatar object already exists is settled: its `avatar_url` is the delivery echo, and re-fetching it would only re-store the same bytes.
 */
export async function scheduleAvatarRehostIfPending(ctx: MutationCtx, profile: Doc<'profiles'>): Promise<void> {
  if (profile.avatar != null || !profile.avatar_url) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.profileAvatars.rehost, {
    profile_id: profile._id,
    source_url: profile.avatar_url,
  });
}
