import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { rebaseAssetReceipts } from './contentImports';
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
 * `family` is null where the link cannot move, and `variantSlug` where the stored slug is no string to keep for the undo.
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
 * Rewrites each Nexus card's variant link to `{ id, slug }` of that variant's Faction, and records the old link in `nexus_link_moves`.
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
    await ctx.db.insert('nexus_link_moves', {
      asset_id: asset._id,
      variant_id: move.variantId,
      variant_slug: move.variantSlug,
      family_id: move.family._id,
    });
  },
});

const MOVE_SCAN_LIMIT = 4000;

/**
 * Carries the import receipts of the moved cards onto their new link, since it changes the state an import compares against.
 * A receipt moves only where it recorded the card exactly as it was before the move, rebuilt from the record's variant link.
 * A card edited by hand since its import, or relinked since the move, keeps its receipt and still reads as a conflict, and a deleted card's receipts stay as they are.
 * It acts on the first record only, so the receipts are scanned once and never once per card.
 * The deploy runs it after `nexus_link_family_v1`, whose id sorts first, and a replay finds no receipt that recorded a variant link.
 */
export const nexus_link_family_v1_receipts = migrations.define({
  table: 'nexus_link_moves',
  migrateOne: async (ctx, move) => {
    if ((await ctx.db.query('nexus_link_moves').first())?._id !== move._id) {
      return;
    }
    const moves = await ctx.db.query('nexus_link_moves').take(MOVE_SCAN_LIMIT + 1);
    if (moves.length > MOVE_SCAN_LIMIT) {
      throw new Error('There are too many moved Nexus cards to refresh their import receipts in one transaction.');
    }
    const dataBefore = new Map<string, unknown>();
    for (const row of moves) {
      const asset = await ctx.db.get('assets', row.asset_id);
      const family = await ctx.db.get('faction_families', row.family_id);
      const link = asset?.data?.factionLink;
      /* A card relinked by hand since the move keeps its receipt, so the edit still reads as a conflict. */
      const asMoved = link?.id === row.family_id && link?.slug === family?.slug;
      if (asset && !asset.is_deleted && asMoved) {
        dataBefore.set(row.asset_id, {
          ...asset.data,
          factionLink: { id: row.variant_id, slug: row.variant_slug },
        });
      }
    }
    await rebaseAssetReceipts(ctx, dataBefore);
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

const UNDO_BATCH = 50;

/**
 * Puts back the variant link of each moved card that still links the Faction it was moved to, while that variant is live, and only then drops the record.
 * Every other record stays, so no old id is lost.
 * A restored variant link is safe with the writer, which stores a live variant's Faction: the card's next save points it at the Faction again.
 * Run by hand from `{ cursor: null }`.
 * It continues itself to the last record and refreshes the restored cards' import receipts.
 */
export const undoNexusLinkMoves = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('nexus_link_moves').paginate({ numItems: UNDO_BATCH, cursor: args.cursor });
    /* Each restored live card's data as the move left it, so only a receipt that recorded that state follows the card back. */
    const dataBefore = new Map<string, unknown>();
    let restored = 0;
    for (const move of page.page) {
      const asset = await ctx.db.get('assets', move.asset_id);
      const variant = await ctx.db.get('factions', move.variant_id);
      if (asset?.data?.factionLink?.id !== move.family_id || !variant || variant.is_deleted) {
        continue;
      }
      await ctx.db.patch('assets', asset._id, {
        data: { ...asset.data, factionLink: { id: move.variant_id, slug: move.variant_slug } },
      });
      await ctx.db.delete('nexus_link_moves', move._id);
      restored += 1;
      if (!asset.is_deleted) {
        dataBefore.set(asset._id, asset.data);
      }
    }
    if (dataBefore.size > 0) {
      await rebaseAssetReceipts(ctx, dataBefore);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.nexusLinkMigrations.undoNexusLinkMoves, {
        cursor: page.continueCursor,
      });
    }
    return { restored, kept: page.page.length - restored };
  },
});

/** Typed by hand, as `CATALOGUE_MIGRATION_IDS` is, so the generated api does not reference itself. */
export const NEXUS_LINK_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  nexus_link_family_v1: internal.nexusLinkMigrations.nexus_link_family_v1,
  nexus_link_family_v1_receipts: internal.nexusLinkMigrations.nexus_link_family_v1_receipts,
  nexus_link_family_verify_v1: internal.nexusLinkMigrations.nexus_link_family_verify_v1,
};
