import { v } from 'convex/values';

import { rulesetInputSchema } from '../src/app/rulesets/validation';
import { CanonicalFactionStoredSchema } from '../src/game/schema/faction';
import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { mutation } from './functions';
import {
  loadAssetAccessBundle,
  loadRulesetAccessForLoadedSubject,
  requireAssignableGroup,
  requireRulesetMaintenance,
  requireRulesetSoftDelete,
  requireRulesetUpdate,
} from './lib/collaborativeAccess';
import {
  rulesetDetailPageValidator,
  rulesetPublicBundleValidator,
} from './lib/collaborativeAccessValidators';
import { loadFaqItemsForRuleset } from './lib/faqRulesetList';
import { requireAuthUserId } from './lib/policy';
import { profileSummary } from './lib/profileSummary';
import { nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

async function getRulesetById(ctx: QueryCtx | MutationCtx, id: Id<'rulesets'>) {
  return await ctx.db.get(id);
}

async function getFactionById(ctx: QueryCtx | MutationCtx, id: Id<'factions'>) {
  return await ctx.db.get(id);
}

function factionIdentityForClient(data: unknown) {
  const parsedFaction = CanonicalFactionStoredSchema.safeParse(data);
  if (!parsedFaction.success) {
    return null;
  }
  const faction = parsedFaction.data;
  return {
    logo: faction.logo,
    background: faction.background,
  };
}

async function listPublicRulesetFactions(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const links = await ctx.db
    .query('ruleset_factions')
    .withIndex('by_ruleset', (q) => q.eq('ruleset_id', rulesetId))
    .take(500);
  const factions = await Promise.all(links.map((link) => getFactionById(ctx, link.faction_id)));

  return factions.flatMap((faction) => {
    if (!faction || faction.is_deleted) {
      return [];
    }
    const dataObj =
      faction.data != null && typeof faction.data === 'object' && !Array.isArray(faction.data)
        ? (faction.data as Record<string, unknown>)
        : null;
    const name = typeof dataObj?.name === 'string' ? dataObj.name : String(faction._id);
    return [
      {
        factionId: faction._id,
        name,
        urlSlug: faction.slug,
        identity: factionIdentityForClient(faction.data),
      },
    ];
  });
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
    if (!row || row.is_deleted) {
      throw new Error(`Ruleset with id ${args.id} not found`);
    }
    return row;
  },
});

async function rulesetBySlugMaybe(ctx: QueryCtx, slug: string) {
  const locatedRow = await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!locatedRow || locatedRow.is_deleted) {
    return null;
  }
  return locatedRow;
}

async function rulesetPublicPage(
  ctx: QueryCtx,
  row: Doc<'rulesets'>,
  viewerAccess: Awaited<ReturnType<typeof loadRulesetAccessForLoadedSubject>>['viewerAccess']
) {
  const factions = await listPublicRulesetFactions(ctx, row._id);
  return {
    ruleset: row,
    factions,
    viewerAccess,
  };
}

async function rulesetPublicBundleBySlug(ctx: QueryCtx, slug: string) {
  const row = await rulesetBySlugMaybe(ctx, slug);
  if (!row) {
    throw new Error(`Ruleset with slug ${slug} not found`);
  }
  const access = await loadRulesetAccessForLoadedSubject(ctx, row);
  return await rulesetPublicPage(ctx, row, access.viewerAccess);
}

export const getBySlug = query({
  args: { slug: v.string() },
  returns: rulesetPublicBundleValidator,
  handler: async (ctx, args) => rulesetPublicBundleBySlug(ctx, args.slug),
});

export const detailPageBySlug = query({
  args: { slug: v.string() },
  returns: rulesetDetailPageValidator,
  handler: async (ctx, args) => {
    const row = await rulesetBySlugMaybe(ctx, args.slug);
    if (!row) {
      return null;
    }
    const access = await loadAssetAccessBundle(ctx, { kind: 'ruleset', row });
    const page = await rulesetPublicPage(ctx, row, access.viewerAccess);
    const faqItems = await loadFaqItemsForRuleset(ctx, row._id);

    const owner = await profileSummary(ctx, row.owner_id);

    return {
      ...page,
      faqItems,
      owner,
      assignableGroups: access.assignableGroups,
    };
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
      await requireAssignableGroup(ctx, args.group_id);
    }

    const duplicate = await ctx.db
      .query('rulesets')
      .withIndex('by_name', (q) => q.eq('name', normalizedName))
      .take(25);
    if (duplicate.some((row) => !row.is_deleted)) {
      throw new Error('Ruleset name already exists');
    }

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
    if (!created) {
      throw new Error('Failed to create ruleset');
    }
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
    const parsed = rulesetInputSchema.safeParse({ name: args.name });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid ruleset input');
    }
    const normalizedName = parsed.data.name;
    const access = await requireRulesetUpdate(ctx, args.id, {
      name: normalizedName,
      groupId: args.group_id,
    });
    const ruleset = access.subject;

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
    if (args.group_id !== undefined) {
      patch.group_id = args.group_id;
    }
    if (args.image_cover !== undefined) {
      patch.image_cover = args.image_cover;
    }

    await ctx.db.patch(ruleset._id, patch);
    const updated = await ctx.db.get(ruleset._id);
    if (!updated) {
      throw new Error('Failed to update ruleset');
    }
    return updated;
  },
});

export const softDelete = mutation({
  args: { id: v.id('rulesets') },
  handler: async (ctx, args) => {
    const { subject: ruleset } = await requireRulesetSoftDelete(ctx, args.id);

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
    await requireRulesetMaintenance(ctx, args.ruleset_id);

    const faction = await getFactionById(ctx, args.faction_id);
    if (!faction || faction.is_deleted) {
      throw new Error('Faction not found');
    }

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
    await requireRulesetMaintenance(ctx, args.ruleset_id);

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
