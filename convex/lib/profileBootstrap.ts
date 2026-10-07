import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { accountStateOf } from './accountLifecycle';
import { scheduleAvatarRehostIfPending } from './profileAvatar';
import { allocateProfileSlug, profileBootstrapSlug } from './profileSlugs';
import { nowIso } from './utils';

export type ProfileBootstrapSources = {
  displayName: string | null;
  imageUrl: string | null;
};

function trimNonEmptyName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function nonEmptyImage(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  return value.length > 0 ? value : null;
}

/** Build sources from a Convex Auth `users` document (after OAuth patch). */
export function profileSourcesFromUserDoc(user: Doc<'users'>): ProfileBootstrapSources {
  return {
    displayName: trimNonEmptyName(user.name as string | undefined),
    imageUrl: nonEmptyImage(user.image as string | undefined),
  };
}

async function refreshExistingProfile(
  ctx: MutationCtx,
  existing: Doc<'profiles'>,
  userId: Id<'users'>,
  displayName: string | null,
  imageUrl: string | null
): Promise<Doc<'profiles'>> {
  if (accountStateOf(existing) !== 'active') {
    return existing;
  }
  const fillUsername = existing.username ?? displayName;
  const fillAvatar = existing.avatar_url ?? imageUrl;
  const needsRefresh =
    fillUsername !== existing.username || fillAvatar !== existing.avatar_url || existing.account_state === undefined;
  if (!needsRefresh) {
    return existing;
  }
  await ctx.db.patch(existing._id, {
    user_id: userId,
    username: fillUsername ?? null,
    avatar_url: fillAvatar ?? null,
    account_state: 'active',
    slug: existing.slug,
    updated_at: nowIso(),
  });
  return (await ctx.db.get(existing._id)) ?? existing;
}

/**
 * Ensures a `profiles` row exists for `userId`, using explicit sources (no `ctx.auth` identity).
 * Backfills missing username/avatar on an existing row when still null.
 */
export async function ensureProfileForUser(
  ctx: MutationCtx,
  userId: Id<'users'>,
  sources: ProfileBootstrapSources
): Promise<Doc<'profiles'>> {
  const displayName = trimNonEmptyName(sources.displayName);
  const imageUrl = nonEmptyImage(sources.imageUrl);

  const existing = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();

  const user = await ctx.db.get('users', userId);
  if (!user) {
    throw new Error(`Cannot create profile for missing user ${userId}`);
  }

  if (accountStateOf(user) !== 'active') {
    return existing ?? Promise.reject(new Error('Inactive accounts cannot create profiles'));
  }

  if (existing) {
    const refreshed = await refreshExistingProfile(ctx, existing, userId, displayName, imageUrl);
    /* The seed funnels through the ledger too: a refresh that filled `avatar_url` from the provider, or a legacy row without a stored avatar, gets its rehost scheduled here. */
    await scheduleAvatarRehostIfPending(ctx, refreshed);
    return refreshed;
  }

  const username = displayName ?? 'nameless';
  const slug = await allocateProfileSlug(ctx, profileBootstrapSlug(username));
  const now = nowIso();
  const inserted = await ctx.db.insert('profiles', {
    user_id: userId,
    username: username ?? null,
    avatar_url: imageUrl ?? null,
    account_state: 'active',
    slug,
    created_at: now,
    updated_at: now,
  });
  const created = await ctx.db.get(inserted);
  if (!created) {
    throw new Error('Failed to read profile after insert');
  }
  await scheduleAvatarRehostIfPending(ctx, created);
  return created;
}
