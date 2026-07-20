import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import { rulesetInputSchema } from '../src/app/rulesets/validation';
import { FactionInputSchema } from '../src/game/schema/faction';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { loadFaqItemsForRuleset } from './lib/faqRulesetList';
import { listByUserActiveWithGroupsData } from './lib/memberGroups';
import { canAccessRuleset, isActiveGroupMember, requireAuthUserId } from './lib/policy';
import { profileSummary } from './lib/profileSummary';
import { ensureObject, nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

async function getRulesetById(ctx: QueryCtx | MutationCtx, id: Id<'rulesets'>) {
  return await ctx.db.get(id);
}

async function getFactionById(ctx: QueryCtx | MutationCtx, id: Id<'factions'>) {
  return await ctx.db.get(id);
}

async function resolveUniqueRulesetSlug(
  ctx: QueryCtx | MutationCtx,
  name: string,
  excludeId?: Id<'rulesets'>
) {
  const baseSlug = slugify(name) || 'ruleset';
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const existing = await ctx.db
      .query('rulesets')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!existing || (excludeId && existing._id === excludeId)) {
      return slug;
    }
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('rulesets')
      .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
      .take(500);
  },
});

export const get = query({
  args: { id: v.id('rulesets') },
  handler: async (ctx, args) => {
    const row = await getRulesetById(ctx, args.id);
    if (!row || row.is_deleted) throw new Error(`Ruleset with id ${args.id} not found`);
    return row;
  },
});

async function rulesetPublicBundleBySlugMaybe(ctx: QueryCtx, slug: string) {
  const row = await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!row || row.is_deleted) return null;

  const links = await ctx.db
    .query('ruleset_factions')
    .withIndex('by_ruleset', (q) => q.eq('ruleset_id', row._id))
    .take(500);
  const factionRows = await Promise.all(links.map((link) => getFactionById(ctx, link.faction_id)));

  const userId = await getAuthUserId(ctx);
  const canAccess =
    userId != null && (await canAccessRuleset(ctx, row, userId as unknown as Id<'users'>));

  return {
    ruleset: row,
    factions: links.map((link, index) => {
      const faction = factionRows[index];
      const data = faction?.data;
      const dataObj = data != null ? ensureObject(data) : null;
      const parsedFaction = FactionInputSchema.safeParse(data);
      const name = typeof dataObj?.name === 'string' ? dataObj.name : String(link.faction_id);
      const urlSlug = typeof faction?.slug === 'string' ? faction.slug : String(link.faction_id);
      return {
        factionId: link.faction_id,
        name,
        urlSlug,
        identity: parsedFaction.success
          ? {
              logo: parsedFaction.data.logo,
              background: parsedFaction.data.background,
            }
          : null,
      };
    }),
    canAccess,
  };
}

async function rulesetPublicBundleBySlug(ctx: QueryCtx, slug: string) {
  const bundle = await rulesetPublicBundleBySlugMaybe(ctx, slug);
  if (!bundle) throw new Error(`Ruleset with slug ${slug} not found`);
  return bundle;
}

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => rulesetPublicBundleBySlug(ctx, args.slug),
});

export const detailPageBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const base = await rulesetPublicBundleBySlugMaybe(ctx, args.slug);
    if (!base) return null;
    const faqItems = await loadFaqItemsForRuleset(ctx, base.ruleset._id);

    let groupAccess: {
      group: Doc<'groups'>;
      members: Array<{
        membership: Doc<'group_members'>;
        profile: Awaited<ReturnType<typeof profileSummary>>;
      }>;
    } | null = null;

    const linkedGroupId = base.ruleset.group_id;
    if (linkedGroupId) {
      const group = await ctx.db.get(linkedGroupId);
      if (group) {
        const memberships = await ctx.db
          .query('group_members')
          .withIndex('by_group', (q) => q.eq('group_id', linkedGroupId))
          .take(500);
        const members = await Promise.all(
          memberships.map(async (m) => ({
            membership: m,
            profile: await profileSummary(ctx, m.user_id),
          }))
        );
        groupAccess = { group, members };
      }
    }

    const owner = await profileSummary(ctx, base.ruleset.owner_id);

    const authUserId = await getAuthUserId(ctx);
    const viewerAssignableMemberships =
      authUserId != null
        ? await listByUserActiveWithGroupsData(ctx, authUserId as unknown as Id<'users'>)
        : null;

    return { ...base, groupAccess, faqItems, owner, viewerAssignableMemberships };
  },
});

export const factionIds = query({
  args: { ruleset_id: v.id('rulesets') },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_ruleset', (q) => q.eq('ruleset_id', args.ruleset_id))
      .take(500);
    return links.map((link) => link.faction_id);
  },
});

export const factionDetails = query({
  args: { ruleset_id: v.id('rulesets') },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_ruleset', (q) => q.eq('ruleset_id', args.ruleset_id))
      .take(500);
    const factions = await Promise.all(links.map((link) => getFactionById(ctx, link.faction_id)));
    return links.map((link, index) => {
      const faction = factions[index];
      const data = faction?.data;
      const dataObj = data != null ? ensureObject(data) : null;
      const parsedFaction = FactionInputSchema.safeParse(data);
      const name = typeof dataObj?.name === 'string' ? dataObj.name : String(link.faction_id);
      const urlSlug = typeof faction?.slug === 'string' ? faction.slug : String(link.faction_id);
      return {
        factionId: link.faction_id,
        name,
        urlSlug,
        identity: parsedFaction.success
          ? {
              logo: parsedFaction.data.logo,
              background: parsedFaction.data.background,
            }
          : null,
      };
    });
  },
});

export const canAccess = query({
  args: { ruleset_id: v.id('rulesets') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const ruleset = await getRulesetById(ctx, args.ruleset_id);
    if (!ruleset) return false;
    return await canAccessRuleset(ctx, ruleset, userId);
  },
});

export const listByFaction = query({
  args: { faction_id: v.id('factions') },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_faction', (q) => q.eq('faction_id', args.faction_id))
      .take(500);
    const rulesets = await Promise.all(links.map((link) => getRulesetById(ctx, link.ruleset_id)));
    return rulesets.filter((row): row is NonNullable<typeof row> => row != null && !row.is_deleted);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    group_id: v.union(v.id('groups'), v.null()),
    image_cover: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const parsed = rulesetInputSchema.safeParse({ name: args.name });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid ruleset input');
    }
    const normalizedName = parsed.data.name;

    if (args.group_id) {
      const canUseGroup = await isActiveGroupMember(ctx, args.group_id, userId);
      if (!canUseGroup) throw new Error('Not authorized for group');
    }

    const duplicate = await ctx.db
      .query('rulesets')
      .withIndex('by_name', (q) => q.eq('name', normalizedName))
      .take(25);
    if (duplicate.some((row) => !row.is_deleted)) throw new Error('Ruleset name already exists');

    const now = nowIso();
    const slug = await resolveUniqueRulesetSlug(ctx, normalizedName);
    const _id = await ctx.db.insert('rulesets', {
      name: normalizedName,
      slug,
      owner_id: userId,
      group_id: args.group_id,
      image_cover: args.image_cover,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    const created = await ctx.db.get(_id);
    if (!created) throw new Error('Failed to create ruleset');
    return created;
  },
});

export const update = mutation({
  args: {
    id: v.id('rulesets'),
    name: v.string(),
    group_id: v.optional(v.union(v.id('groups'), v.null())),
    image_cover: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const parsed = rulesetInputSchema.safeParse({ name: args.name });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid ruleset input');
    }
    const normalizedName = parsed.data.name;
    const ruleset = await getRulesetById(ctx, args.id);
    if (!ruleset || ruleset.is_deleted) throw new Error(`Ruleset with id ${args.id} not found`);

    if (ruleset.owner_id !== userId) {
      throw new Error('Only the ruleset owner can update this ruleset');
    }

    if (args.group_id !== undefined) {
      if (args.group_id !== null) {
        const canUseGroup = await isActiveGroupMember(ctx, args.group_id, userId);
        if (!canUseGroup) throw new Error('Not authorized for group');
      }
    }

    const duplicate = await ctx.db
      .query('rulesets')
      .withIndex('by_name', (q) => q.eq('name', normalizedName))
      .take(25);
    if (duplicate.some((row) => row._id !== args.id && !row.is_deleted)) {
      throw new Error('Ruleset name already exists');
    }

    const patch: {
      name: string;
      slug: string;
      updated_at: string;
      group_id?: Id<'groups'> | null;
      image_cover?: string | null;
    } = {
      name: normalizedName,
      slug: await resolveUniqueRulesetSlug(ctx, normalizedName, args.id),
      updated_at: nowIso(),
    };
    if (args.group_id !== undefined) patch.group_id = args.group_id;
    if (args.image_cover !== undefined) patch.image_cover = args.image_cover;

    await ctx.db.patch(ruleset._id, patch);
    const updated = await ctx.db.get(ruleset._id);
    if (!updated) throw new Error('Failed to update ruleset');
    return updated;
  },
});

export const softDelete = mutation({
  args: { id: v.id('rulesets') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const ruleset = await getRulesetById(ctx, args.id);
    if (!ruleset) throw new Error(`Ruleset with id ${args.id} not found`);

    const permitted = await canAccessRuleset(ctx, ruleset, userId);
    if (!permitted) throw new Error('Not authorized');

    await ctx.db.patch(ruleset._id, {
      is_deleted: true,
      updated_at: nowIso(),
    });
  },
});

export const addFaction = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    faction_id: v.id('factions'),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const ruleset = await getRulesetById(ctx, args.ruleset_id);
    if (!ruleset || ruleset.is_deleted) throw new Error('Ruleset not found');

    const allowed = await canAccessRuleset(ctx, ruleset, userId);
    if (!allowed) throw new Error('Not authorized');

    const faction = await getFactionById(ctx, args.faction_id);
    if (!faction || faction.is_deleted) throw new Error('Faction not found');

    const existing = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_ruleset_faction', (q) =>
        q.eq('ruleset_id', args.ruleset_id).eq('faction_id', args.faction_id)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert('ruleset_factions', {
        ruleset_id: args.ruleset_id,
        faction_id: args.faction_id,
      });
    }
    return args;
  },
});

export const removeFaction = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    faction_id: v.id('factions'),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const ruleset = await getRulesetById(ctx, args.ruleset_id);
    if (!ruleset || ruleset.is_deleted) throw new Error('Ruleset not found');

    const allowed = await canAccessRuleset(ctx, ruleset, userId);
    if (!allowed) throw new Error('Not authorized');

    const existing = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_ruleset_faction', (q) =>
        q.eq('ruleset_id', args.ruleset_id).eq('faction_id', args.faction_id)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return args;
  },
});
