import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import { profileUserEditFormSchema } from '../src/app/profile/validation';
import { FactionInputSchema } from '../src/game/schema/faction';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
import { requireAuthUserId } from './lib/policy';
import { ensureProfileForUser } from './lib/profileBootstrap';
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
    if (!authUserId) return null;
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
    if (!profile) throw new Error('Failed to bootstrap profile');
    return profile;
  },
});

export const getById = query({
  args: { id: v.id('profiles') },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.id);
    if (!profile) throw new Error(`Profile with id ${args.id} not found`);
    return profile;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
    if (!profile) throw new Error(`Profile with slug ${args.slug} not found`);

    const memberships = await ctx.db
      .query('group_members')
      .withIndex('by_user_status', (q) => q.eq('user_id', profile.user_id).eq('status', 'active'))
      .take(500);

    const groupsWithNulls = await Promise.all(
      memberships.map((membership) => ctx.db.get('groups', membership.group_id))
    );
    const groups = groupsWithNulls.filter(
      (group): group is NonNullable<(typeof groupsWithNulls)[number]> => group !== null
    );

    // biome-ignore lint/suspicious/noExplicitAny: runQuery return type is circular via generated api
    const faqAsked: any = await ctx.runQuery(api.faq.askedBy, {
      profile_id: profile.user_id,
    });
    // biome-ignore lint/suspicious/noExplicitAny: runQuery return type is circular via generated api
    const faqAnswers: any = await ctx.runQuery(api.faq.answeredBy, {
      profile_id: profile.user_id,
    });

    const factionRows = await ctx.db
      .query('factions')
      .withIndex('by_owner_deleted', (q) =>
        q.eq('owner_id', profile.user_id).eq('is_deleted', false)
      )
      .take(500);
    const factions = factionRows.map((row) => ({
      ...row,
      data: FactionInputSchema.parse(row.data),
    }));

    return {
      profile,
      memberships,
      groups,
      faqAsked,
      faqAnswers,
      factions,
    };
  },
});

export const getByUserId = query({
  args: { user_id: v.id('users') },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', args.user_id))
      .unique();
    if (!profile) throw new Error(`Profile with user id ${args.user_id} not found`);
    return profile;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('profiles').take(500);
  },
});

export const updateCurrent = mutation({
  args: {
    username: v.string(),
    avatar_url: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const profile = await createProfileIfMissing(ctx, userId);
    if (!profile) throw new Error('Profile not found');

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
      if (!slugOwner || slugOwner.user_id === userId) break;
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
    if (!updated) throw new Error('Failed to update profile');
    return updated;
  },
});
