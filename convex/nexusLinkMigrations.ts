import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { nexusFactionTarget } from './lib/nexusFaction';
import schema from './schema';
import type { QueryCtx } from './types';

/*
 * A Nexus card links a whole Faction (#2921); a card saved before that links one variant, and these move it to the variant's Faction.
 * A one-off family in its own module, deleted with its ids once production has run them.
 */
const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'nexusLinkMigrations:',
  schema,
});

/**
 * Where a card's variant link moves: the variant's Faction, as the writer would store it, while the variant is live and its Faction leads to a live default variant.
 * Null for a card whose link names no variant, which includes every card already moved.
 * `family` is null where the link cannot move, and `variantSlug` where the stored slug is no string.
 * The id is checked against `factions` first, so a card that links a deleted variant is listed rather than read as moved.
 */
async function variantLinkMove(ctx: Pick<QueryCtx, 'db'>, asset: Doc<'assets'>) {
  const link: { id?: unknown; slug?: unknown } | undefined =
    asset.type === 'card-nexus' ? asset.data?.factionLink : undefined;
  const variantId = typeof link?.id === 'string' ? ctx.db.normalizeId('factions', link.id) : null;
  if (!variantId) {
    return null;
  }
  const target = await nexusFactionTarget(ctx, variantId);
  return {
    variantId,
    variantSlug: typeof link?.slug === 'string' ? link.slug : null,
    family: target?.family ?? null,
  };
}

type VariantLinkMove = NonNullable<Awaited<ReturnType<typeof variantLinkMove>>>;

function canMove(
  move: VariantLinkMove | null
): move is VariantLinkMove & { family: Doc<'faction_families'>; variantSlug: string } {
  return !!move?.family && move.variantSlug !== null;
}

/**
 * Rewrites each Nexus card's variant link to `{ id, slug }` of that variant's Faction.
 * It recorded the old link in `nexus_link_moves` for an undo, which was dropped once the move held (#2933).
 * Only `factionLink` changes: the name, symbol, artwork and edit date stay, and nothing is queued for publication, since the card draws the same.
 * A card whose variant is deleted, whose Faction is gone, or whose stored slug is unreadable stays as it is, logged here and listed by `unmovedNexusLinks`.
 * A moved card names a Faction, so a replay writes nothing.
 */
export const nexus_link_family_v1 = migrations.define({
  table: 'assets',
  customRange: (q) => q.withIndex('by_type_deleted', (range) => range.eq('type', 'card-nexus')),
  batchSize: 25,
  migrateOne: async (ctx, asset) => {
    const move = await variantLinkMove(ctx, asset);
    if (!move) {
      return;
    }
    if (!canMove(move)) {
      console.warn(`Nexus card ${asset._id} links variant ${move.variantId}, which cannot move; left unchanged.`);
      return;
    }
    await ctx.db.patch('assets', asset._id, {
      data: { ...asset.data, factionLink: { id: move.family._id, slug: move.family.slug } },
    });
  },
});

/**
 * Carried the import receipts of the moved cards onto their new link, reading the old links from `nexus_link_moves`.
 * Production has run it, and the records it read are gone, so its body is a no-op and its id stays.
 */
export const nexus_link_family_v1_receipts = migrations.define({
  table: 'assets',
  customRange: (q) => q.withIndex('by_type_deleted', (range) => range.eq('type', 'card-nexus')),
  migrateOne: async () => {},
});

/** Empties `nexus_link_moves`, the undo records of the move, which Norbert chose to drop (#2933); the table leaves the schema once it is empty. */
export const nexus_link_moves_clear_v1 = migrations.define({
  table: 'nexus_link_moves',
  migrateOne: async (ctx, move) => {
    await ctx.db.delete('nexus_link_moves', move._id);
  },
});

/** Proves no card still links a variant it could have moved from; the cards that could not move pass, and `unmovedNexusLinks` lists them. */
export const nexus_link_family_verify_v1 = migrations.define({
  table: 'assets',
  customRange: (q) => q.withIndex('by_type_deleted', (range) => range.eq('type', 'card-nexus')),
  batchSize: 25,
  migrateOne: async (ctx, asset) => {
    if (canMove(await variantLinkMove(ctx, asset))) {
      throw new Error(`Nexus card ${asset._id} still links a variant of a live Faction.`);
    }
  },
});

const UNMOVED_SCAN_LIMIT = 2000;

/** The Nexus cards that still link a variant after the move, because the variant is deleted, its Faction is gone or the stored slug is unreadable. */
export const unmovedNexusLinks = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cards = await ctx.db
      .query('assets')
      .withIndex('by_type_deleted', (q) => q.eq('type', 'card-nexus'))
      .take(UNMOVED_SCAN_LIMIT);
    const unmoved = [];
    for (const card of cards) {
      const move = await variantLinkMove(ctx, card);
      if (move && !canMove(move)) {
        unmoved.push({ assetId: card._id, slug: card.slug, variantId: move.variantId });
      }
    }
    return { scanned: cards.length, truncated: cards.length === UNMOVED_SCAN_LIMIT, unmoved };
  },
});

/** Typed by hand, as `CATALOGUE_MIGRATION_IDS` is, so the generated api does not reference itself. */
export const NEXUS_LINK_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  nexus_link_family_v1: internal.nexusLinkMigrations.nexus_link_family_v1,
  nexus_link_family_v1_receipts: internal.nexusLinkMigrations.nexus_link_family_v1_receipts,
  nexus_link_family_verify_v1: internal.nexusLinkMigrations.nexus_link_family_verify_v1,
  nexus_link_moves_clear_v1: internal.nexusLinkMigrations.nexus_link_moves_clear_v1,
};
