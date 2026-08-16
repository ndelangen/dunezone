import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { nowIso, slugify } from './utils';

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

async function allocateUniqueProfileSlug(ctx: MutationCtx, usernameForSlug: string): Promise<string> {
  const baseSlug = slugify(usernameForSlug);
  if (baseSlug.length === 0) {
    throw new Error('Failed to generate slug from display name');
  }
  let slug = baseSlug;
  let suffix = 1;
  while (
    await ctx.db
      .query('profiles')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
  ) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
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

  if (existing) {
    const fillUsername = existing.username ?? displayName;
    const fillAvatar = existing.avatar_url ?? imageUrl;
    const nextSlug = existing.slug;

    if (fillUsername !== existing.username || fillAvatar !== existing.avatar_url || nextSlug !== existing.slug) {
      await ctx.db.patch(existing._id, {
        user_id: userId,
        username: fillUsername ?? null,
        avatar_url: fillAvatar ?? null,
        slug: nextSlug,
        updated_at: nowIso(),
      });
      const refreshed = await ctx.db.get(existing._id);
      if (refreshed) {
        return refreshed;
      }
    }
    return existing;
  }

  const username = displayName ?? 'nameless';
  const baseSlug = slugify(username);
  if (baseSlug.length === 0) {
    throw new Error('Failed to generate slug from display name');
  }
  const slug = await allocateUniqueProfileSlug(ctx, username);
  const now = nowIso();
  const inserted = await ctx.db.insert('profiles', {
    user_id: userId,
    username: username ?? null,
    avatar_url: imageUrl ?? null,
    slug,
    created_at: now,
    updated_at: now,
  });
  const created = await ctx.db.get(inserted);
  if (!created) {
    throw new Error('Failed to read profile after insert');
  }
  return created;
}
