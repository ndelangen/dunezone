import { v } from 'convex/values';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation } from './functions';
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

      await ctx.db.insert('factions', {
        owner_id: owner._id,
        data: faction.data,
        slug: faction.slug,
        created_at: faction.created_at,
        updated_at: faction.updated_at,
        is_deleted: false,
        group_id: groupId,
      });
    }

    return { importedFactions: args.factions.length };
  },
});

/**
 * PROTOTYPE ONLY — Wayfinder issue #183: seeds one group with an owner, an active member, a
 * pending member, a faction, and a ruleset so the `?variant=` switcher on the group detail page
 * has real content to render. Not for merge — drop before landing the winning variant.
 *
 * `ownerEmail`/`activeMemberEmail` must already be real, password-login-capable local accounts
 * (sign in once via /auth/login under E2E_LOCAL_AUTH first) — issue #348's entity-picker only
 * shows to a signed-in active member, so testing it needs a real session, not a dummy user.
 */
export const seedGroupDetailPrototype = mutation({
  args: {
    ownerEmail: v.string(),
    activeMemberEmail: v.string(),
  },
  returns: v.object({ groupSlug: v.string() }),
  handler: async (ctx, args) => {
    assertLocalDevelopmentMode();

    const now = nowIso();
    const owner = await findUserByEmail(ctx, args.ownerEmail);
    const activeMember = await findUserByEmail(ctx, args.activeMemberEmail);
    const ownerId = owner._id;
    const activeMemberId = activeMember._id;
    const pendingMemberId = await ctx.db.insert('users', { name: 'Pending Applicant' });

    await ensureProfileForUser(ctx, ownerId, { displayName: 'Prototype Owner', imageUrl: null });
    await ensureProfileForUser(ctx, activeMemberId, {
      displayName: 'Prototype Member',
      imageUrl: null,
    });
    await ensureProfileForUser(ctx, pendingMemberId, {
      displayName: 'Pending Applicant',
      imageUrl: null,
    });

    const groupId = await ctx.db.insert('groups', {
      name: 'Prototype Guild',
      slug: 'prototype-guild',
      created_at: now,
      created_by: ownerId,
    });

    const otherGroupId = await ctx.db.insert('groups', {
      name: 'Other Guild',
      slug: 'other-guild',
      created_at: now,
      created_by: ownerId,
    });
    await ctx.db.insert('group_members', {
      group_id: otherGroupId,
      user_id: activeMemberId,
      status: 'active',
      requested_at: now,
      approved_at: now,
      approved_by: ownerId,
    });

    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: ownerId,
      status: 'active',
      requested_at: now,
      approved_at: now,
      approved_by: ownerId,
    });
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: activeMemberId,
      status: 'active',
      requested_at: now,
      approved_at: now,
      approved_by: ownerId,
    });
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: pendingMemberId,
      status: 'pending',
      requested_at: now,
      approved_at: null,
      approved_by: null,
    });

    await ctx.db.insert('factions', {
      owner_id: ownerId,
      data: assetPublishingFaction,
      slug: 'prototype-atreides',
      created_at: now,
      updated_at: now,
      is_deleted: false,
      group_id: groupId,
    });

    await ctx.db.insert('rulesets', {
      name: 'PrototypeRuleset',
      slug: 'prototype-ruleset',
      created_at: now,
      updated_at: now,
      owner_id: ownerId,
      group_id: groupId,
      is_deleted: false,
      image_cover: null,
    });

    // Owned by the active member (not the owner) — exercises the entity-picker as the member,
    // not the owner, and covers both branches: an unassigned pick and a reassign-with-confirm pick.
    await ctx.db.insert('factions', {
      owner_id: activeMemberId,
      data: { ...assetPublishingFaction, name: 'Unassigned Harkonnen' },
      slug: 'prototype-harkonnen-unassigned',
      created_at: now,
      updated_at: now,
      is_deleted: false,
      group_id: null,
    });
    await ctx.db.insert('factions', {
      owner_id: activeMemberId,
      data: { ...assetPublishingFaction, name: 'Other Guild Ordos' },
      slug: 'prototype-ordos-other-guild',
      created_at: now,
      updated_at: now,
      is_deleted: false,
      group_id: otherGroupId,
    });
    await ctx.db.insert('rulesets', {
      name: 'UnassignedRuleset',
      slug: 'prototype-ruleset-unassigned',
      created_at: now,
      updated_at: now,
      owner_id: activeMemberId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    await ctx.db.insert('rulesets', {
      name: 'OtherGuildRuleset',
      slug: 'prototype-ruleset-other-guild',
      created_at: now,
      updated_at: now,
      owner_id: activeMemberId,
      group_id: otherGroupId,
      is_deleted: false,
      image_cover: null,
    });

    return { groupSlug: 'prototype-guild' };
  },
});
