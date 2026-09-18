import { v } from 'convex/values';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import type { PublicationAssetType } from '../src/shared/asset-publishing/publicationTargets';
import { CanonicalFactionStoredSchema } from '../src/shared/factions/schema';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { listRulesetAssetSlots } from './lib/rulesetDetailPage';

/*
 * What Play reads of the catalogue when a game captures it.
 * Both reads are public and viewer-free, the way the asset page reads the game Worker already uses
 * are: they project rows and publications the catalogue already exposes, and decide nothing about
 * readiness.
 * The game contract (`src/shared/play/capture.ts`) owns the capture records built from them.
 */

const sourceValidator = v.object({ id: v.string(), slug: v.string(), name: v.string() });

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
  returns: v.union(
    v.null(),
    v.object({
      ruleset: sourceValidator,
      slots: v.array(
        v.object({
          slot: v.string(),
          asset: v.object({ id: v.string(), type: v.string(), slug: v.string(), name: v.string() }),
        })
      ),
    })
  ),
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
 * The stored definition a game captures at public assignment, with the faces its generated components have published: the faction token and one image per supporting leader.
 * The definition travels as stored;
 * the game contract decides whether it is complete.
 */
export const factionDefinition = query({
  args: { factionId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      faction: sourceValidator,
      data: v.any(),
      token: v.union(v.string(), v.null()),
      leaders: v.array(v.object({ memberId: v.string(), front: v.union(v.string(), v.null()) })),
    })
  ),
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
      data: row.data,
      token: await publishedFace(ctx, 'faction-token', row._id),
      leaders,
    };
  },
});
