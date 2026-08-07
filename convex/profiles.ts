import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import { profileUserEditFormSchema } from '../src/app/profile/validation';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { mutation } from './functions';
import { profileDetailPageValidator, profileValidator } from './lib/collaborativeAccessValidators';
import { requireAuthUserId } from './lib/policy';
import { loadProfileActivityCounts } from './lib/profileActivity';
import { ensureProfileForUser } from './lib/profileBootstrap';
import { loadProfileDetailBySlug } from './lib/profileDetail';
import {
  discoverableProfileValidator,
  loadNewestDiscoverableProfiles,
} from './lib/profileDiscovery';
import { nowIso, slugify } from './lib/utils';

async function createProfileIfMissing(ctx: MutationCtx, userId: Id<'users'>) {
  const identity = await ctx.auth.getUserIdentity();
  const authUserId = await getAuthUserId(ctx);
  const authUser = authUserId ? await ctx.db.get(authUserId) : null;
  const identityName =
    typeof identity?.name === 'string' && identity.name.trim().length > 0
      ? identity.name.trim()
      : null;
  const identityPictureUrl =
    typeof (identity as { pictureUrl?: unknown } | null)?.pictureUrl === 'string' &&
    ((identity as { pictureUrl?: string } | null)?.pictureUrl?.length ?? 0) > 0
      ? ((identity as { pictureUrl?: string } | null)?.pictureUrl ?? null)
      : null;
  const authUserName =
    authUser && typeof (authUser as { name?: unknown }).name === 'string'
      ? ((authUser as { name?: string }).name?.trim().length ?? 0) > 0
        ? (authUser as { name: string }).name.trim()
        : null
      : null;
  const authUserImage =
    authUser && typeof (authUser as { image?: unknown }).image === 'string'
      ? ((authUser as { image?: string }).image ?? null)
      : null;

  const displayName = identityName ?? authUserName ?? null;
  const imageUrl =
    identityPictureUrl ?? (authUserImage && authUserImage.length > 0 ? authUserImage : null);

  return await ensureProfileForUser(ctx, userId, {
    displayName,
    imageUrl,
  });
}

export const currentUserId = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    return authUserId ?? null;
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      return null;
    }
    return await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', authUserId))
      .unique();
  },
});

export const bootstrapCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const profile = await createProfileIfMissing(ctx, userId);
    if (!profile) {
      throw new Error('Failed to bootstrap profile');
    }
    return profile;
  },
});

export const getById = query({
  args: { id: v.id('profiles') },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.id);
    if (!profile) {
      throw new Error(`Profile with id ${args.id} not found`);
    }
    return profile;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: profileDetailPageValidator,
  handler: async (ctx, args) => await loadProfileDetailBySlug(ctx, args.slug),
});

const profileListEntryValidator = profileValidator.extend({
  activity: v.object({
    groupCount: v.number(),
    factionCount: v.number(),
    questionCount: v.number(),
    answerCount: v.number(),
  }),
});

export const list = query({
  args: {},
  returns: v.array(profileListEntryValidator),
  handler: async (ctx) => {
    const profiles = await ctx.db.query('profiles').take(500);
    const activity = await loadProfileActivityCounts(
      ctx,
      profiles.map((profile) => profile.user_id)
    );
    return profiles.map((profile, index) => ({
      ...profile,
      activity: activity[index] ?? {
        groupCount: 0,
        factionCount: 0,
        questionCount: 0,
        answerCount: 0,
      },
    }));
  },
});

export const newestDiscoverable = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(discoverableProfileValidator),
  handler: async (ctx, args) => await loadNewestDiscoverableProfiles(ctx, args.limit ?? 4),
});

export const updateCurrent = mutation({
  args: {
    username: v.string(),
    avatar_url: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const profile = await createProfileIfMissing(ctx, userId);
    if (!profile) {
      throw new Error('Profile not found');
    }

    const parsed = profileUserEditFormSchema.safeParse({
      username: args.username,
      avatar_url: args.avatar_url ?? '',
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid profile input');
    }
    const normalizedUsername = parsed.data.username;
    const normalizedAvatarUrl = parsed.data.avatar_url;

    const nextSlugBase = slugify(normalizedUsername);
    if (nextSlugBase.length === 0) {
      throw new Error('Failed to generate slug from display name');
    }
    let nextSlug = nextSlugBase;
    let suffix = 1;
    while (true) {
      const slugOwner = await ctx.db
        .query('profiles')
        .withIndex('by_slug', (q) => q.eq('slug', nextSlug))
        .unique();
      if (!slugOwner || slugOwner.user_id === userId) {
        break;
      }
      suffix += 1;
      nextSlug = `${nextSlugBase}-${suffix}`;
    }

    await ctx.db.patch(profile._id, {
      username: normalizedUsername,
      avatar_url: normalizedAvatarUrl,
      slug: nextSlug,
      updated_at: nowIso(),
    });

    const updated = await ctx.db.get(profile._id);
    if (!updated) {
      throw new Error('Failed to update profile');
    }
    return updated;
  },
});
