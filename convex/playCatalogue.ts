import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import type { PublicationAssetType } from '../src/shared/asset-publishing/publicationTargets';
import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { CanonicalFactionStoredSchema } from '../src/shared/factions/schema';
import { factionDefinitionSchema, rulesetSupplySchema } from '../src/shared/play/capture';
import { playDraftableFactionsSchema } from '../src/shared/play/drafting';
import type { QueryCtx } from './_generated/server';
import { query } from './_generated/server';
import { presetFor } from './lib/cardbackPresets';
import { listRulesetAssetSlots } from './lib/rulesetSlots';

/*
 * What Play reads of the catalogue when a game captures it.
 * Both reads are public and viewer-free, the way the asset page reads the game Worker already uses
 * are: they project rows and publications the catalogue already exposes, and decide nothing about
 * readiness.
 * The game contract (`src/shared/play/capture.ts`) owns both answer shapes and the capture records
 * built from them; the wire validators derive from it.
 */

/**
 * The current publication of one face, if any.
 * A pending or failed replacement leaves the existing publication in place, so a face with an older usable image still reads as published.
 */
async function publishedFace(ctx: QueryCtx, assetType: PublicationAssetType, assetId: string) {
  const publication = await ctx.db
    .query('publication_assets')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', assetType).eq('asset_id', assetId))
    .unique();
  return publication ? publishedHref(assetType, assetId, publication.cache_token) : null;
}

/** The slotted supply a game captures at creation. A soft-deleted or unknown ruleset reads as absent. */
export const rulesetSupply = query({
  args: { rulesetId: v.string() },
  returns: v.union(v.null(), zodToConvex(rulesetSupplySchema)),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('rulesets', args.rulesetId);
    const row = id ? await ctx.db.get('rulesets', id) : null;
    if (!row || row.is_deleted) {
      return null;
    }
    return {
      ruleset: { id: row._id, slug: row.slug, name: row.name },
      slots: await listRulesetAssetSlots(ctx, row._id),
    };
  },
});

/**
 * The stored definition a game captures at public assignment, with the faces its generated components have published.
 * A row that does not parse as a canonical faction reads with no definition;
 * the game contract decides what an absent or incomplete definition means.
 */
export const factionDefinition = query({
  args: { factionId: v.string() },
  returns: v.union(v.null(), zodToConvex(factionDefinitionSchema)),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('factions', args.factionId);
    const row = id ? await ctx.db.get('factions', id) : null;
    if (!row || row.is_deleted) {
      return null;
    }
    const parsed = CanonicalFactionStoredSchema.safeParse(row.data);
    const leaders = [];
    for (const leader of parsed.success ? parsed.data.leaders : []) {
      leaders.push({
        memberId: leader.memberId,
        front: await publishedFace(ctx, 'faction-leader', factionMemberPublicationId(row._id, leader.memberId)),
      });
    }
    return {
      faction: { id: row._id, slug: row.slug, name: parsed.success ? parsed.data.name : '' },
      data: parsed.success ? parsed.data : null,
      token: await publishedFace(ctx, 'faction-token', row._id),
      cardbacks: { traitor: (await presetFor(ctx, 'traitor')).href, alliance: (await presetFor(ctx, 'alliance')).href },
      leaders,
    };
  },
});

/**
 * Every live faction as a drafting game reads it: its token's render data, its theme colour, whether it is linked to the game's ruleset and whether its token is published.
 * A row that does not parse is left out;
 * readiness beyond the token is judged by the capture at assignment.
 */
export const draftableFactions = query({
  args: { rulesetId: v.string() },
  returns: zodToConvex(playDraftableFactionsSchema),
  handler: async (ctx, args) => {
    const rulesetId = ctx.db.normalizeId('rulesets', args.rulesetId);
    const links = rulesetId
      ? await ctx.db
          .query('ruleset_factions')
          .withIndex('by_ruleset', (q) => q.eq('ruleset_id', rulesetId))
          .take(500)
      : [];
    const linked = new Set(links.map((link) => link.faction_id));
    const rows = await ctx.db
      .query('factions')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .take(500);
    const factions = [];
    for (const row of rows) {
      const parsed = CanonicalFactionStoredSchema.safeParse(row.data);
      if (!parsed.success) {
        continue;
      }
      factions.push({
        id: row._id,
        slug: row.slug,
        name: parsed.data.name,
        logo: parsed.data.logo,
        background: parsed.data.background,
        color: parsed.data.themeColor,
        linked: linked.has(row._id),
        published: (await publishedFace(ctx, 'faction-token', row._id)) !== null,
      });
    }
    return { factions };
  },
});
