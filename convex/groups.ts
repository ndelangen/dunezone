import { ConvexError, v } from 'convex/values';

import { groupInputSchema } from '../src/shared/groups/validation';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, mutation, publicQuery, viewerQuery } from './functions';
import { resolveBackgrounds } from './lib/backgroundPresets';
import {
  liveGroupOrNull,
  loadGroupRoster,
  loadViewerAssignableGroups,
  loadViewerMembership,
  requireGroupCapability,
} from './lib/collaborativeAccess';
import {
  assignedGroupSummaryValidator,
  groupPageValidator,
  viewerMembershipStateValidator,
} from './lib/collaborativeAccessValidators';
import { factionRowForClient } from './lib/factionInput';
import { recordFormerSlug } from './lib/formerSlugs';
import { retireGroupInvitations } from './lib/groupInvitations';
import { requireAuthUserId } from './lib/policy';
import { allocateCounterSlug } from './lib/slugCounters';
import { loadGroupStandings } from './lib/standings';
import { nowIso, slugify } from './lib/utils';

async function resolveUniqueGroupSlug(ctx: MutationCtx, name: string, own?: Doc<'groups'>) {
  const base = slugify(name) || 'group';
  if (own && (slugify(own.name) || 'group') === base) {
    return own.slug;
  }
  return await allocateCounterSlug(ctx, `group-slug:${JSON.stringify([base])}`, base, async (slug) => {
    if (slug === 'create') {
      return false;
    }
    const existing = await ctx.db
      .query('groups')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    return !existing || existing._id === own?._id;
  });
}

/**
 * The viewer's membership of one Group: the viewer half of a page's capabilities.
 * Pages return their public facts from a `publicQuery`, and the browser combines them with this using the shared rules in `src/shared/access`.
 */
export const viewerMembership = viewerQuery({
  args: { groupId: v.union(v.id('groups'), v.null()) },
  returns: viewerMembershipStateValidator,
  handler: async (ctx, args) => await loadViewerMembership(ctx, args.groupId),
});

/** The Groups the viewer can move a subject into, for the Group picker on edit pages. */
export const viewerAssignableGroups = viewerQuery({
  args: {},
  returns: v.array(assignedGroupSummaryValidator),
  handler: async (ctx) => await loadViewerAssignableGroups(ctx),
});

export const getById = publicQuery({
  args: { id: v.id('groups') },
  handler: async (ctx, args) => {
    const group = liveGroupOrNull(await ctx.db.get(args.id));
    if (!group) {
      throw new Error(`Group with id ${args.id} not found`);
    }
    return group;
  },
});

/** The Group page, the same for every viewer: the Group, its owner and roster, and what is assigned to it. Throws NOT_FOUND for an unknown or deleted slug. */
async function loadGroupPageBySlug(ctx: QueryCtx, slug: string) {
  const group = liveGroupOrNull(
    await ctx.db
      .query('groups')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
  );
  if (!group) {
    throw new ConvexError({ code: 'NOT_FOUND', message: `Group with slug ${slug} not found` });
  }

  const [{ owner, roster }, factions, rulesets] = await Promise.all([
    loadGroupRoster(ctx, group),
    ctx.db
      .query('factions')
      .withIndex('by_group_deleted', (q) => q.eq('group_id', group._id).eq('is_deleted', false))
      .take(500),
    ctx.db
      .query('rulesets')
      .withIndex('by_group_deleted', (q) => q.eq('group_id', group._id).eq('is_deleted', false))
      .take(500),
  ]);

  return { group, factions: await resolveBackgrounds(ctx, factions.map(factionRowForClient)), rulesets, owner, roster };
}

/**
 * The Group page, one cached answer for every viewer.
 * The browser combines `group.created_by`, the roster's `isGroupOwner` and the viewer's membership to decide what they may do.
 */
export const detailPage = publicQuery({
  args: { slug: v.string() },
  returns: groupPageValidator,
  handler: async (ctx, args) => await loadGroupPageBySlug(ctx, args.slug),
});

const groupStandingMemberValidator = v.object({
  slug: v.string(),
  name: v.string(),
  image: v.union(v.string(), v.null()),
});

/**
 * The profile directory's Groups list: live Groups by active members, then by what they maintain.
 * Load more asks again with a larger `limit`;
 * `hasMore` says whether that would show more.
 */
export const standings = publicQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    entries: v.array(
      v.object({
        rank: v.number(),
        slug: v.string(),
        name: v.string(),
        memberCount: v.number(),
        factionCount: v.number(),
        members: v.array(groupStandingMemberValidator),
      })
    ),
    hasMore: v.boolean(),
    limit: v.number(),
  }),
  handler: async (ctx, args) => await loadGroupStandings(ctx, args.limit),
});

export const list = publicQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('groups')
      .filter((q) => q.eq(q.field('is_deleted'), false))
      .take(500);
  },
});

export const listByCreator = publicQuery({
  args: { created_by: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('groups')
      .withIndex('by_created_by', (q) => q.eq('created_by', args.created_by))
      .filter((q) => q.eq(q.field('is_deleted'), false))
      .take(500);
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const parsed = groupInputSchema.safeParse({ name: args.name });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid group input');
    }
    const normalizedName = parsed.data.name;
    const existing = await ctx.db
      .query('groups')
      .withIndex('by_name', (q) => q.eq('name', normalizedName))
      .unique();
    if (existing) {
      throw new Error('Group name already exists');
    }

    const now = nowIso();
    const slug = await resolveUniqueGroupSlug(ctx, normalizedName);
    const _id = await ctx.db.insert('groups', {
      name: normalizedName,
      slug,
      created_by: userId,
      created_at: now,
      is_deleted: false,
    });
    await ctx.db.insert('group_members', {
      group_id: _id,
      user_id: userId,
      status: 'active',
      requested_at: now,
      approved_at: now,
      approved_by: userId,
    });

    const row = await ctx.db.get(_id);
    if (!row) {
      throw new Error('Failed to create group');
    }
    return row;
  },
});

export const update = mutation({
  args: {
    id: v.id('groups'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const parsed = groupInputSchema.safeParse({ name: args.name });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid group input');
    }
    const normalizedName = parsed.data.name;
    const { subject: group } = await requireGroupCapability(ctx, args.id, 'rename');

    const nameOwner = await ctx.db
      .query('groups')
      .withIndex('by_name', (q) => q.eq('name', normalizedName))
      .unique();
    if (nameOwner && nameOwner._id !== args.id) {
      throw new Error('Group name already exists');
    }

    const slug = await resolveUniqueGroupSlug(ctx, normalizedName, group);
    if (slug !== group.slug) {
      await recordFormerSlug(ctx, { kind: 'group', scope: '', slug: group.slug, record_id: group._id });
    }
    await ctx.db.patch(group._id, { name: normalizedName, slug });
    const updated = await ctx.db.get(group._id);
    if (!updated) {
      throw new Error('Failed to update group');
    }
    return updated;
  },
});

export const softDelete = mutation({
  args: { id: v.id('groups') },
  handler: async (ctx, args) => {
    const { subject: group } = await requireGroupCapability(ctx, args.id, 'delete');
    await ctx.db.patch(group._id, { is_deleted: true });
    if (await retireGroupInvitations(ctx, group._id)) {
      await ctx.scheduler.runAfter(0, internal.groups.retireDeletedGroupInvitations, { groupId: group._id });
    }
    return args.id;
  },
});

/** The rest of a deleted Group's invitations, a batch per run, for a Group that held more than one transaction retires. */
export const retireDeletedGroupInvitations = internalMutation({
  args: { groupId: v.id('groups') },
  handler: async (ctx, args) => {
    if (await retireGroupInvitations(ctx, args.groupId)) {
      await ctx.scheduler.runAfter(0, internal.groups.retireDeletedGroupInvitations, args);
    }
    return null;
  },
});
