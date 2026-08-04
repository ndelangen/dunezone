import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation } from './functions';
import { setHomepageCommunityPresence } from './lib/homepageCommunity';
import { ensureProfileForUser } from './lib/profileBootstrap';
import { nowIso } from './lib/utils';

const importedGroupValidator = v.object({
  name: v.string(),
  slug: v.string(),
  created_at: v.string(),
});

const importedFactionValidator = v.object({
  data: v.any(),
  slug: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  group: v.union(importedGroupValidator, v.null()),
});

function assertLocalDevelopmentMode() {
  if (process.env.IS_TEST !== 'true') {
    throw new Error('Local development helpers are only available when IS_TEST=true');
  }
}

async function findUserByEmail(ctx: MutationCtx, email: string): Promise<Doc<'users'>> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = (await ctx.db.query('users').take(500)).find(
    (candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail
  );
  if (!user) {
    throw new Error(`Local auth user not found: ${normalizedEmail}`);
  }
  return user;
}

async function ensureActiveMembership(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
  approvedBy: Id<'users'>,
  timestamp: string
) {
  const existing = await ctx.db
    .query('group_members')
    .withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', userId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      status: 'active',
      approved_at: timestamp,
      approved_by: approvedBy,
    });
    return;
  }

  await ctx.db.insert('group_members', {
    group_id: groupId,
    user_id: userId,
    status: 'active',
    requested_at: timestamp,
    approved_at: timestamp,
    approved_by: approvedBy,
  });
}

async function ensureImportedGroup(
  ctx: MutationCtx,
  group: {
    name: string;
    slug: string;
    created_at: string;
  },
  ownerId: Id<'users'>,
  collaboratorId: Id<'users'>
) {
  const existing = await ctx.db
    .query('groups')
    .withIndex('by_slug', (q) => q.eq('slug', group.slug))
    .unique();
  const groupId =
    existing?._id ??
    (await ctx.db.insert('groups', {
      name: group.name,
      slug: group.slug,
      created_at: group.created_at,
      created_by: ownerId,
    }));

  await ensureActiveMembership(ctx, groupId, ownerId, ownerId, group.created_at);
  await ensureActiveMembership(ctx, groupId, collaboratorId, ownerId, group.created_at);
  return groupId;
}

async function prepareLocalProfile(
  ctx: MutationCtx,
  user: Doc<'users'>,
  label: string,
  slug: string
) {
  const profile = await ensureProfileForUser(ctx, user._id, {
    displayName: label,
    imageUrl: null,
  });
  await ctx.db.patch(profile._id, {
    username: label,
    slug,
    updated_at: nowIso(),
  });
}

export const prepareFactionImport = mutation({
  args: {
    ownerEmail: v.string(),
    collaboratorEmail: v.string(),
  },
  returns: v.object({
    ownerId: v.id('users'),
    collaboratorId: v.id('users'),
  }),
  handler: async (ctx, args) => {
    assertLocalDevelopmentMode();
    const owner = await findUserByEmail(ctx, args.ownerEmail);
    const collaborator = await findUserByEmail(ctx, args.collaboratorEmail);

    await prepareLocalProfile(ctx, owner, 'Local reviewer A', 'local-reviewer-a');
    await prepareLocalProfile(ctx, collaborator, 'Local reviewer B', 'local-reviewer-b');

    return {
      ownerId: owner._id,
      collaboratorId: collaborator._id,
    };
  },
});

export const importFactionBatch = mutation({
  args: {
    ownerEmail: v.string(),
    collaboratorEmail: v.string(),
    factions: v.array(importedFactionValidator),
  },
  returns: v.object({
    importedFactions: v.number(),
  }),
  handler: async (ctx, args) => {
    assertLocalDevelopmentMode();
    const owner = await findUserByEmail(ctx, args.ownerEmail);
    const collaborator = await findUserByEmail(ctx, args.collaboratorEmail);

    for (const faction of args.factions) {
      const groupId = faction.group
        ? await ensureImportedGroup(ctx, faction.group, owner._id, collaborator._id)
        : null;

      const factionId = await ctx.db.insert('factions', {
        owner_id: owner._id,
        data: faction.data,
        slug: faction.slug,
        created_at: faction.created_at,
        updated_at: faction.updated_at,
        is_deleted: false,
        group_id: groupId,
      });
      await setHomepageCommunityPresence(ctx, 'factions', factionId, true);
    }

    return { importedFactions: args.factions.length };
  },
});
