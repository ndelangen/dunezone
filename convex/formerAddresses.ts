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

/** Renames away from one address that a lookup follows, newest first, before giving up on it. */
const FORMER_HOLDERS_READ = 8;

/**
 * The newest live record a rename moved away from this address, read from the table the kind names.
 * A deleted former holder no longer holds the address, so an older live one behind it still answers.
 */
async function formerRecord<Table extends 'factions' | 'assets' | 'groups' | 'rulesets' | 'rulebooks'>(
  ctx: QueryCtx,
  table: Table,
  kind: Doc<'former_slugs'>['kind'],
  scope: string,
  slug: string
) {
  const rows = await ctx.db
    .query('former_slugs')
    .withIndex('by_kind_and_scope_and_slug', (q) => q.eq('kind', kind).eq('scope', scope).eq('slug', slug))
    .order('desc')
    .take(FORMER_HOLDERS_READ);
  for (const row of rows) {
    const id = ctx.db.normalizeId(table, row.record_id);
    const record = id && (await ctx.db.get(table, id));
    if (record && !record.is_deleted) {
      return record;
    }
  }
  return null;
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

async function factionAt(ctx: QueryCtx, slug: string) {
  const holder = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .first();
  return await liveAt(holder, () => formerRecord(ctx, 'factions', 'faction', '', slug));
}

async function assetAt(ctx: QueryCtx, type: string, slug: string) {
  const holder = await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', type).eq('slug', slug))
    .first();
  return await liveAt(holder, () => formerRecord(ctx, 'assets', 'asset', type, slug));
}

async function groupAt(ctx: QueryCtx, slug: string) {
  const holder = await ctx.db
    .query('groups')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .first();
  return await liveAt(holder, () => formerRecord(ctx, 'groups', 'group', '', slug));
}

async function faqQuestionIn(ctx: QueryCtx, rulesetId: Id<'rulesets'>, slug: string) {
  return await ctx.db
    .query('faq_items')
    .withIndex('by_ruleset_slug', (q) => q.eq('ruleset_id', rulesetId).eq('slug', slug))
    .first();
}

type AddressOf<Kind extends Address['kind']> = Extract<Address, { kind: Kind }>;

/** Each address kind's lookup: where its record lives now, and the address it was asked for. */
const ADDRESSES: {
  [Kind in Address['kind']]: {
    current: (ctx: QueryCtx, address: AddressOf<Kind>) => Promise<string | null>;
    requested: (address: AddressOf<Kind>) => string;
  };
} = {
  faction: {
    current: async (ctx, { slug }) => {
      const faction = await factionAt(ctx, slug);
      return faction && pathname('factions', faction.slug);
    },
    requested: ({ slug }) => pathname('factions', slug),
  },
  asset: {
    current: async (ctx, { type, slug }) => {
      const asset = await assetAt(ctx, type, slug);
      return asset && pathname('assets', asset.type, asset.slug);
    },
    requested: ({ type, slug }) => pathname('assets', type, slug),
  },
  group: {
    current: async (ctx, { slug }) => {
      const group = await groupAt(ctx, slug);
      return group && pathname('groups', group.slug);
    },
    requested: ({ slug }) => pathname('groups', slug),
  },
  ruleset: {
    current: async (ctx, { slug }) => {
      const ruleset = await rulesetAt(ctx, slug);
      return ruleset && pathname('rulesets', ruleset.slug);
    },
    requested: ({ slug }) => pathname('rulesets', slug),
  },
  rulebook: {
    current: async (ctx, { ruleset_slug, rulebook_slug }) => {
      const ruleset = await rulesetAt(ctx, ruleset_slug);
      const rulebook = ruleset && (await rulebookAt(ctx, ruleset._id, rulebook_slug));
      /* A Rulebook never changes Ruleset, so this only guards a row that names one from elsewhere. */
      return ruleset && rulebook?.ruleset_id === ruleset._id
        ? pathname('rulesets', ruleset.slug, 'rulebooks', rulebook.slug)
        : null;
    },
    requested: ({ ruleset_slug, rulebook_slug }) => pathname('rulesets', ruleset_slug, 'rulebooks', rulebook_slug),
  },
  faq: {
    current: async (ctx, { ruleset_slug, question_slug }) => {
      const ruleset = await rulesetAt(ctx, ruleset_slug);
      const question = ruleset && (await faqQuestionIn(ctx, ruleset._id, question_slug));
      return question && ruleset ? pathname('rulesets', ruleset.slug, 'faq', question.slug) : null;
    },
    requested: ({ ruleset_slug, question_slug }) => pathname('rulesets', ruleset_slug, 'faq', question_slug),
  },
};

/**
 * Where a record that used to live at an address lives now, for a public page whose own query found nothing there.
 * Null when the address is still its record's own, when nothing ever moved away from it, or when the record that did is deleted.
 * Pages call it only after a miss, so a page that exists pays nothing for it.
 */
export const resolve = publicQuery({
  args: { address: addressValidator },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { address }) => {
    /* The table pairs each kind with its own address shape, which an indexed read cannot express. */
    const lookup = ADDRESSES[address.kind] as {
      current: (ctx: QueryCtx, address: Address) => Promise<string | null>;
      requested: (address: Address) => string;
    };
    const current = await lookup.current(ctx, address);
    return current === lookup.requested(address) ? null : current;
  },
});
