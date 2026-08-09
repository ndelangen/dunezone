import { v } from 'convex/values';

import { groupInputSchema } from '../src/app/groups/validation';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { query } from './_generated/server';
import { mutation } from './functions';
import {
  liveGroupOrNull,
  loadGroupAccessBundle,
  requireGroupCapability,
} from './lib/collaborativeAccess';
import { groupDetailPageValidator } from './lib/collaborativeAccessValidators';
import { requireAuthUserId } from './lib/policy';
import { nowIso, slugify } from './lib/utils';

async function resolveUniqueGroupSlug(
  ctx: QueryCtx | MutationCtx,
  name: string,
  excludeId?: Id<'groups'>
) {
  const baseSlug = slugify(name) || 'group';
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const existing = await ctx.db
      .query('groups')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!existing || (excludeId && existing._id === excludeId)) {
      return slug;
    }
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

export const getById = query({
  args: { id: v.id('groups') },
  handler: async (ctx, args) => {
    const group = liveGroupOrNull(await ctx.db.get(args.id));
    if (!group) {
      throw new Error(`Group with id ${args.id} not found`);
    }
    return group;
  },
});

/** Group detail page with canonical access, owner, roster, and associated assets. */
export const detailBySlug = query({
  args: { slug: v.string() },
  returns: groupDetailPageValidator,
  handler: async (ctx, args) => {
    const group = liveGroupOrNull(
      await ctx.db
        .query('groups')
        .withIndex('by_slug', (q) => q.eq('slug', args.slug))
        .unique()
    );
    if (!group) {
      throw new Error(`Group with slug ${args.slug} not found`);
    }

    const accessBundle = await loadGroupAccessBundle(ctx, group);

    const factions = await ctx.db
      .query('factions')
      .withIndex('by_group_deleted', (q) => q.eq('group_id', group._id).eq('is_deleted', false))
      .take(500);

    const rulesets = await ctx.db
      .query('rulesets')
      .withIndex('by_group_deleted', (q) => q.eq('group_id', group._id).eq('is_deleted', false))
      .take(500);

    return {
      group: accessBundle.subject,
      factions,
      rulesets,
      owner: accessBundle.owner,
      viewerAccess: accessBundle.viewerAccess,
      roster: accessBundle.roster,
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('groups').take(500);
    return rows.filter((row) => liveGroupOrNull(row) !== null);
  },
});

export const listByCreator = query({
  args: { created_by: v.id('users') },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('groups')
      .withIndex('by_created_by', (q) => q.eq('created_by', args.created_by))
      .take(500);
    return rows.filter((row) => liveGroupOrNull(row) !== null);
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

    const slug = await resolveUniqueGroupSlug(ctx, normalizedName, args.id);
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
    return args.id;
  },
});
