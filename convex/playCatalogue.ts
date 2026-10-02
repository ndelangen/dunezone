import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { factionTroopPublicationId } from '../src/shared/asset-publishing/factionTroopPublication';
import type { PublicationAssetType } from '../src/shared/asset-publishing/publicationTargets';
import {
  isPublicationAssetType,
  publicationFaceId,
  publishedHref,
} from '../src/shared/asset-publishing/publicationTargets';
import { CanonicalFactionStoredSchema } from '../src/shared/factions/schema';
import { assetSupplySchema, factionDefinitionSchema, rulesetSupplySchema } from '../src/shared/play/capture';
import { playDraftableFactionsSchema } from '../src/shared/play/drafting';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { query } from './_generated/server';
import { publicationStatusFor } from './assetPublishingStatus';
import { CONTAINER_KINDS, liveAsset, membersOf, referencedCardbackDeck, tokenBackFor } from './assets';
import { resolveBackHref, TOKEN_ASSET_TYPES } from './lib/assetBacks';
import { assetDisplayName } from './lib/assetInput';
import type { CardbackPresetMemo } from './lib/cardbackPresets';
import { listRulesetAssetSlots } from './lib/rulesetSlots';

/*
 * What Play reads of the catalogue when a game captures it or drafts from it.
 * Every read is public and viewer-free: it projects rows and publications the catalogue already
 * exposes, and decides nothing about readiness.
 * The game contract (`src/shared/play/capture.ts` and `drafting.ts`) owns every answer shape and
 * the records built from them; the wire validators derive from it.
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

/**
 * The shared prediction card's front, the Treachery card an Administrator authored at this slug, or null when it is absent or unpublished (#1753).
 * Every faction's prediction is drawn over this one base until prediction cards get their own asset type.
 */
const PREDICTION_CARD = { type: 'card-treachery', slug: 'prediction' } as const;
async function predictionFront(ctx: QueryCtx) {
  const row = await liveAsset(ctx, PREDICTION_CARD.type, PREDICTION_CARD.slug);
  return row ? await publishedFace(ctx, PREDICTION_CARD.type, row._id) : null;
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
    const troops = await Promise.all(
      (parsed.success ? parsed.data.troops : []).flatMap(({ troopId }) => {
        if (!troopId) {
          return [];
        }
        const id = factionTroopPublicationId(row._id, troopId);
        return [
          Promise.all([
            publishedFace(ctx, 'faction-troop', id),
            publishedFace(ctx, 'faction-troop', publicationFaceId(id, 'back')),
          ]).then(([front, back]) => ({ troopId, front, back })),
        ];
      })
    );
    const traitors = await Promise.all(
      (parsed.success ? parsed.data.leaders : []).map(async ({ memberId }) => ({
        memberId,
        front: await publishedFace(ctx, 'faction-traitor', factionMemberPublicationId(row._id, memberId)),
      }))
    );
    return {
      faction: { id: row._id, slug: row.slug, name: parsed.success ? parsed.data.name : '' },
      data: parsed.success ? parsed.data : null,
      token: await publishedFace(ctx, 'faction-token', row._id),
      tokenBack: await publishedFace(ctx, 'faction-token', publicationFaceId(row._id, 'back')),
      cardbacks: {
        traitor: await publishedFace(ctx, 'cardback-preset', 'traitor'),
        alliance: await publishedFace(ctx, 'cardback-preset', 'alliance'),
        prediction: await publishedFace(ctx, 'cardback-preset', 'prediction'),
      },
      leaders,
      troops,
      traitors,
      alliance: await publishedFace(ctx, 'faction-alliance', row._id),
      prediction: await predictionFront(ctx),
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
        /* A game needs both faces of the reversible token, so a faction is draftable only once both are published. */
        published:
          (await publishedFace(ctx, 'faction-token', row._id)) !== null &&
          (await publishedFace(ctx, 'faction-token', publicationFaceId(row._id, 'back'))) !== null,
      });
    }
    return { factions };
  },
});

function supplyEntry(row: Doc<'assets'>) {
  return { id: row._id, type: row.type, slug: row.slug, name: assetDisplayName(row), data: row.data };
}

/** One asset's faces as the asset page resolves them, with the rows its back is authored on. */
async function suppliedAsset(ctx: QueryCtx, row: Doc<'assets'>, presets: CardbackPresetMemo) {
  const backToken = TOKEN_ASSET_TYPES.has(row.type) ? await tokenBackFor(ctx, row._id, row.data) : null;
  const backDeck = await referencedCardbackDeck(ctx, row);
  const back = await resolveBackHref(ctx, row, presets);
  return {
    asset: supplyEntry(row),
    front: isPublicationAssetType(row.type)
      ? (await publicationStatusFor(ctx, row.type, row._id)).publicationHref
      : null,
    back: back?.href ?? null,
    backMode: back?.mode ?? null,
    backToken: backToken && supplyEntry(backToken),
    backDeck: backDeck && supplyEntry(backDeck),
  };
}

/**
 * One card, token, deck or bundle as a game captures it, every member's faces included, in one read.
 * A soft-deleted or unknown asset reads as absent, and a soft-deleted member is left out, as the asset page leaves it out.
 */
export const assetSupply = query({
  args: { type: v.string(), slug: v.string() },
  returns: v.union(v.null(), zodToConvex(assetSupplySchema)),
  handler: async (ctx, args) => {
    const row = await liveAsset(ctx, args.type, args.slug);
    if (!row) {
      return null;
    }
    const presets: CardbackPresetMemo = new Map();
    const container = CONTAINER_KINDS[row.type];
    const { entries, truncated } = container
      ? await membersOf(ctx, row._id, container.kind)
      : { entries: [], truncated: false };
    const members = await Promise.all(
      entries.map(async ({ row: member, count }) => ({ ...(await suppliedAsset(ctx, member, presets)), count }))
    );
    return { ...(await suppliedAsset(ctx, row, presets)), members, membersTruncated: truncated };
  },
});
