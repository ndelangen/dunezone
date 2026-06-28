import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import { FactionInputSchema } from '../src/game/schema/faction';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { isActiveGroupMember, requireAuthUserId } from './lib/policy';
import { profileSummary } from './lib/profileSummary';
import { nowIso, slugify } from './lib/utils';
import type { QueryCtx } from './types';

/** Groups relevant to the faction row + viewer memberships only (no full-table scan). */
async function groupsForFactionAndMemberships(
  ctx: QueryCtx,
  factionGroupId: Id<'groups'> | null | undefined,
  memberships: { group_id: Id<'groups'> }[]
) {
  const groupIds = new Set<Id<'groups'>>();
  if (factionGroupId) {
    groupIds.add(factionGroupId);
  }
  for (const m of memberships) {
    groupIds.add(m.group_id);
  }
  const groups = [];
  for (const gid of groupIds) {
    const g = await ctx.db.get('groups', gid);
    if (g) {
      groups.push(g);
    }
  }
  return groups;
}

function normalizeFactionData(input: unknown) {
  const parsed = FactionInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const issuePath = firstIssue?.path.join('.') ?? 'data';
    const issueMessage = firstIssue?.message ?? 'Invalid faction data';
    throw new Error(`Invalid faction data at ${issuePath}: ${issueMessage}`);
  }
  return parsed.data;
}

/** Faction detail page bundle (view, edit, and sheet preview). */
async function loadFactionDetailPageBySlug(ctx: QueryCtx, slug: string) {
  const row = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!row || row.is_deleted) throw new Error(`Faction with slug ${slug} not found`);

  const ownerProfile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', row.owner_id))
    .unique();
  if (!ownerProfile) throw new Error(`Profile with user id ${row.owner_id} not found`);

  const group = row.group_id ? await ctx.db.get('groups', row.group_id) : null;

  const authUserId = await getAuthUserId(ctx);
  const memberships =
    authUserId != null
      ? await ctx.db
          .query('group_members')
          .withIndex('by_user_status', (q) => q.eq('user_id', authUserId).eq('status', 'active'))
          .take(500)
      : [];

  const groups = await groupsForFactionAndMemberships(ctx, row.group_id, memberships);

  let groupAccess: {
    group: Doc<'groups'>;
    members: Array<{
      membership: Doc<'group_members'>;
      profile: Awaited<ReturnType<typeof profileSummary>>;
    }>;
  } | null = null;

  const linkedGroupId = row.group_id;
  if (linkedGroupId && group) {
    const groupMemberships = await ctx.db
      .query('group_members')
      .withIndex('by_group', (q) => q.eq('group_id', linkedGroupId))
      .take(500);
    const members = await Promise.all(
      groupMemberships.map(async (m) => ({
        membership: m,
        profile: await profileSummary(ctx, m.user_id),
      }))
    );
    groupAccess = { group, members };
  }

  return {
    faction: {
      ...row,
      data: FactionInputSchema.parse(row.data),
    },
    owner: ownerProfile,
    group,
    memberships,
    groups,
    groupAccess,
  };
}

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => loadFactionDetailPageBySlug(ctx, args.slug),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('factions')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .take(500);
  },
});

/** Factions + resolved group/owner labels and the caller's group memberships for the load picker. */
export const listForLoadPicker = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);

    const factionRows = await ctx.db
      .query('factions')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .take(500);

    const memberships = await ctx.db
      .query('group_members')
      .withIndex('by_user_status', (q) => q.eq('user_id', userId).eq('status', 'active'))
      .take(500);
    const memberGroupIds = [...new Set(memberships.map((m) => m.group_id))];

    const groupIds = new Set<Id<'groups'>>();
    for (const row of factionRows) {
      if (row.group_id) {
        groupIds.add(row.group_id);
      }
    }
    const groupNameById = new Map<string, string>();
    for (const gid of groupIds) {
      const group = await ctx.db.get('groups', gid);
      if (group) {
        groupNameById.set(gid, group.name.trim());
      }
    }

    const ownerIds = [...new Set(factionRows.map((row) => row.owner_id))];
    const ownerUsernameById = new Map<string, string | null>();
    for (const oid of ownerIds) {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', oid))
        .unique();
      ownerUsernameById.set(oid, profile?.username ?? null);
    }

    const rows = factionRows.map((row) => {
      const data = FactionInputSchema.parse(row.data);
      const groupId = row.group_id ?? null;
      const groupLabel = groupId ? (groupNameById.get(groupId) ?? groupId) : 'No group';
      return {
        id: row._id,
        slug: row.slug,
        data,
        groupId,
        groupLabel,
        ownerId: row.owner_id,
        ownerUsername: ownerUsernameById.get(row.owner_id) ?? null,
      };
    });

    return { rows, memberGroupIds };
  },
});

export const listByOwner = query({
  args: { owner_id: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('factions')
      .withIndex('by_owner_deleted', (q) => q.eq('owner_id', args.owner_id).eq('is_deleted', false))
      .take(500);
  },
});

export const listByGroup = query({
  args: { group_id: v.id('groups') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('factions')
      .withIndex('by_group_deleted', (q) => q.eq('group_id', args.group_id).eq('is_deleted', false))
      .take(500);
  },
});

export const create = mutation({
  args: {
    data: v.any(),
    group_id: v.union(v.id('groups'), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    if (args.group_id) {
      const canUseGroup = await isActiveGroupMember(ctx, args.group_id, userId);
      if (!canUseGroup) throw new Error('Not authorized for group');
    }

    const data = normalizeFactionData(args.data);
    const slug = slugify(data.name);
    const existing = await ctx.db
      .query('factions')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (existing && !existing.is_deleted) {
      throw new Error(`Faction with id ${slug} already exists`);
    }

    const now = nowIso();
    const _id = await ctx.db.insert('factions', {
      owner_id: userId,
      data,
      slug,
      group_id: args.group_id,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    const row = await ctx.db.get(_id);
    if (!row) throw new Error('Failed to create faction');
    return row;
  },
});

export const update = mutation({
  args: {
    id: v.id('factions'),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.is_deleted) throw new Error(`Faction with id ${args.id} not found`);
    const isOwner = row.owner_id === userId;
    const isGroupEditor =
      row.group_id == null ? false : await isActiveGroupMember(ctx, row.group_id, userId);
    if (!isOwner && !isGroupEditor) throw new Error('Not authorized');

    const data = normalizeFactionData(args.data);
    const slug = slugify(data.name);
    const slugOwner = await ctx.db
      .query('factions')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (slugOwner && slugOwner._id !== args.id && !slugOwner.is_deleted) {
      throw new Error(`Faction with id ${slug} already exists`);
    }

    await ctx.db.patch(args.id, {
      data,
      slug,
      updated_at: nowIso(),
    });
    const updated = await ctx.db.get(args.id);
    if (!updated) throw new Error('Failed to update faction');
    return updated;
  },
});

export const setGroup = mutation({
  args: {
    id: v.id('factions'),
    group_id: v.union(v.id('groups'), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.is_deleted) throw new Error(`Faction with id ${args.id} not found`);
    if (row.owner_id !== userId) throw new Error('Not authorized');
    if (args.group_id) {
      const canUseGroup = await isActiveGroupMember(ctx, args.group_id, userId);
      if (!canUseGroup) throw new Error('Not authorized for group');
    }

    await ctx.db.patch(args.id, {
      group_id: args.group_id,
      updated_at: nowIso(),
    });
    const updated = await ctx.db.get(args.id);
    if (!updated) throw new Error('Failed to update faction group');
    return updated;
  },
});

export const softDelete = mutation({
  args: { id: v.id('factions') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error(`Faction with id ${args.id} not found`);
    if (row.owner_id !== userId) throw new Error('Not authorized');

    await ctx.db.patch(args.id, {
      is_deleted: true,
      updated_at: nowIso(),
    });
  },
});

export const getFullBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('factions')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
    if (!row || row.is_deleted) throw new Error(`Faction with slug ${args.slug} not found`);
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', row.owner_id))
      .unique();
    if (!profile) throw new Error(`Profile with user id ${row.owner_id} not found`);
    const group = row.group_id ? await ctx.db.get('groups', row.group_id) : null;

    return {
      ...row,
      data: FactionInputSchema.parse(row.data),
      owner: profile,
      group: group,
    };
  },
});

export const getCreatePageContext = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', userId))
      .unique();

    const groups = await ctx.db
      .query('groups')
      .withIndex('by_created_by', (q) => q.eq('created_by', userId))
      .take(500);

    const memberships = await ctx.db
      .query('group_members')
      .withIndex('by_user_status', (q) => q.eq('user_id', userId).eq('status', 'active'))
      .take(500);

    return {
      ownerProfile: profile,
      groups,
      memberships,
    };
  },
});
