import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { publicQuery } from './functions';
import type { QueryCtx } from './types';

const addressValidator = v.union(
  v.object({ kind: v.literal('faction'), slug: v.string() }),
  v.object({ kind: v.literal('asset'), type: v.string(), slug: v.string() }),
  v.object({ kind: v.literal('group'), slug: v.string() }),
  v.object({ kind: v.literal('ruleset'), slug: v.string() }),
  v.object({ kind: v.literal('rulebook'), ruleset_slug: v.string(), rulebook_slug: v.string() }),
  v.object({ kind: v.literal('faq'), ruleset_slug: v.string(), question_slug: v.string() })
);

type Address = Infer<typeof addressValidator>;

function pathname(...segments: string[]) {
  return segments.map((segment) => '/' + encodeURIComponent(segment)).join('');
}

/** The record a rename most recently moved away from this address, read from the table the kind names. */
async function formerRecord<Table extends 'factions' | 'assets' | 'groups' | 'rulesets' | 'rulebooks'>(
  ctx: QueryCtx,
  table: Table,
  kind: Doc<'former_slugs'>['kind'],
  scope: string,
  slug: string
) {
  const row = await ctx.db
    .query('former_slugs')
    .withIndex('by_kind_and_scope_and_slug', (q) => q.eq('kind', kind).eq('scope', scope).eq('slug', slug))
    .order('desc')
    .first();
  const id = row && ctx.db.normalizeId(table, row.record_id);
  return id ? await ctx.db.get(table, id) : null;
}

/**
 * The live record an address leads to.
 * Deleted rows keep their addresses, so a current holder, live or deleted, is always newer than any rename away from that address and decides alone.
 */
async function liveAt<Row extends { is_deleted: boolean }>(
  holder: Row | null,
  former: () => Promise<Row | null>
): Promise<Row | null> {
  const row = holder ?? (await former());
  return row && !row.is_deleted ? row : null;
}

async function rulesetAt(ctx: QueryCtx, slug: string) {
  const holder = await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .first();
  return await liveAt(holder, () => formerRecord(ctx, 'rulesets', 'ruleset', '', slug));
}

async function rulebookAt(ctx: QueryCtx, rulesetId: Id<'rulesets'>, slug: string) {
  const holder = await ctx.db
    .query('rulebooks')
    .withIndex('by_ruleset_and_slug', (q) => q.eq('ruleset_id', rulesetId).eq('slug', slug))
    .first();
  return await liveAt(holder, () => formerRecord(ctx, 'rulebooks', 'rulebook', rulesetId, slug));
}

async function currentPathname(ctx: QueryCtx, address: Address): Promise<string | null> {
  switch (address.kind) {
    case 'faction': {
      const holder = await ctx.db
        .query('factions')
        .withIndex('by_slug', (q) => q.eq('slug', address.slug))
        .first();
      const faction = await liveAt(holder, () => formerRecord(ctx, 'factions', 'faction', '', address.slug));
      return faction && pathname('factions', faction.slug);
    }
    case 'asset': {
      const holder = await ctx.db
        .query('assets')
        .withIndex('by_type_and_slug', (q) => q.eq('type', address.type).eq('slug', address.slug))
        .first();
      const asset = await liveAt(holder, () => formerRecord(ctx, 'assets', 'asset', address.type, address.slug));
      return asset && pathname('assets', asset.type, asset.slug);
    }
    case 'group': {
      const holder = await ctx.db
        .query('groups')
        .withIndex('by_slug', (q) => q.eq('slug', address.slug))
        .first();
      const group = await liveAt(holder, () => formerRecord(ctx, 'groups', 'group', '', address.slug));
      return group && pathname('groups', group.slug);
    }
    case 'ruleset': {
      const ruleset = await rulesetAt(ctx, address.slug);
      return ruleset && pathname('rulesets', ruleset.slug);
    }
    case 'rulebook': {
      const ruleset = await rulesetAt(ctx, address.ruleset_slug);
      const rulebook = ruleset && (await rulebookAt(ctx, ruleset._id, address.rulebook_slug));
      /* A Rulebook never changes Ruleset, so this only guards a row that names one from elsewhere. */
      return rulebook && rulebook.ruleset_id === ruleset._id
        ? pathname('rulesets', ruleset.slug, 'rulebooks', rulebook.slug)
        : null;
    }
    case 'faq': {
      const ruleset = await rulesetAt(ctx, address.ruleset_slug);
      const question =
        ruleset &&
        (await ctx.db
          .query('faq_items')
          .withIndex('by_ruleset_slug', (q) => q.eq('ruleset_id', ruleset._id).eq('slug', address.question_slug))
          .first());
      return question ? pathname('rulesets', ruleset.slug, 'faq', question.slug) : null;
    }
  }
}

function requestedPathname(address: Address) {
  switch (address.kind) {
    case 'faction':
      return pathname('factions', address.slug);
    case 'asset':
      return pathname('assets', address.type, address.slug);
    case 'group':
      return pathname('groups', address.slug);
    case 'ruleset':
      return pathname('rulesets', address.slug);
    case 'rulebook':
      return pathname('rulesets', address.ruleset_slug, 'rulebooks', address.rulebook_slug);
    case 'faq':
      return pathname('rulesets', address.ruleset_slug, 'faq', address.question_slug);
  }
}

/**
 * Where a record that used to live at an address lives now, for a public page whose own query found nothing there.
 * Null when the address is still its record's own, when nothing ever moved away from it, or when the record that did is deleted.
 * Pages call it only after a miss, so a page that exists pays nothing for it.
 */
export const resolve = publicQuery({
  args: { address: addressValidator },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const current = await currentPathname(ctx, args.address);
    return current === requestedPathname(args.address) ? null : current;
  },
});
