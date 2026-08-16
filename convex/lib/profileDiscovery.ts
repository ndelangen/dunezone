import { DirectAggregate } from '@convex-dev/aggregate';
import type { Triggers } from 'convex-helpers/server/triggers';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { components } from '../_generated/api';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const MAX_DISCOVERY_LIMIT = 20;

export const discoverableProfileValidator = v.object({
  id: v.id('profiles'),
  slug: v.string(),
  username: v.string(),
  avatarUrl: v.string(),
  createdAt: v.string(),
});

export type DiscoverableProfile = Infer<typeof discoverableProfileValidator>;

type ProfileDiscoveryItem = {
  key: string;
  id: string;
};

const profileDiscovery = new DirectAggregate<{
  Key: string;
  Id: string;
}>(components.profileDiscovery);

export function isProfileDiscoverable<
  T extends Pick<Doc<'profiles'>, 'username' | 'avatar_url' | 'slug' | 'created_at'>,
>(
  profile: T
): profile is T & {
  username: string;
  avatar_url: string;
} {
  return (
    (profile.username?.trim().length ?? 0) > 0 &&
    (profile.avatar_url?.trim().length ?? 0) > 0 &&
    profile.slug.trim().length !== 0 &&
    profile.slug !== 'user' &&
    profile.slug !== 'nameless' &&
    Number.isFinite(Date.parse(profile.created_at))
  );
}

function profileDiscoveryItem(profile: Doc<'profiles'>): ProfileDiscoveryItem | null {
  return isProfileDiscoverable(profile) ? { key: profile.created_at, id: profile._id } : null;
}

function sameItem(left: ProfileDiscoveryItem | null, right: ProfileDiscoveryItem | null) {
  return left?.key === right?.key && left?.id === right?.id;
}

async function applyTransition(
  ctx: MutationCtx,
  oldItem: ProfileDiscoveryItem | null,
  newItem: ProfileDiscoveryItem | null
) {
  if (sameItem(oldItem, newItem)) {
    if (newItem) {
      await profileDiscovery.insertIfDoesNotExist(ctx, newItem);
    }
    return;
  }
  if (oldItem && newItem) {
    await profileDiscovery.replaceOrInsert(ctx, oldItem, newItem);
    return;
  }
  if (oldItem) {
    await profileDiscovery.deleteIfExists(ctx, oldItem);
    return;
  }
  if (newItem) {
    await profileDiscovery.insertIfDoesNotExist(ctx, newItem);
  }
}

export function registerProfileDiscoveryTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('profiles', async (ctx, change) => {
    await applyTransition(
      ctx,
      change.oldDoc ? profileDiscoveryItem(change.oldDoc) : null,
      change.newDoc ? profileDiscoveryItem(change.newDoc) : null
    );
  });
}

export async function reconcileProfileDiscovery(ctx: MutationCtx, profile: Doc<'profiles'>) {
  const item = { key: profile.created_at, id: profile._id };
  if (isProfileDiscoverable(profile)) {
    await profileDiscovery.insertIfDoesNotExist(ctx, item);
  } else {
    await profileDiscovery.deleteIfExists(ctx, item);
  }
}

export async function loadNewestDiscoverableProfiles(ctx: QueryCtx, limit: number): Promise<DiscoverableProfile[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DISCOVERY_LIMIT) {
    throw new Error(`Profile discovery limit must be between 1 and ${MAX_DISCOVERY_LIMIT}`);
  }
  const { page } = await profileDiscovery.paginate(ctx, {
    order: 'desc',
    pageSize: limit,
  });
  const profiles = await Promise.all(page.map((item) => ctx.db.get(item.id as Id<'profiles'>)));
  return profiles
    .filter((profile) => profile !== null && isProfileDiscoverable(profile))
    .map((profile) => ({
      id: profile._id,
      slug: profile.slug,
      username: profile.username,
      avatarUrl: profile.avatar_url,
      createdAt: profile.created_at,
    }));
}
