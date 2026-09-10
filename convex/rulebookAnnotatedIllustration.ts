import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { isComponentAssetType } from '../src/shared/asset-publishing/componentGeometry';
import {
  factionMemberPublicationId,
  parseFactionMemberPublicationId,
} from '../src/shared/asset-publishing/componentPublication';
import { CanonicalFactionStoredSchema } from '../src/shared/factions/schema';
import {
  resolveRulebookAnnotatedIllustrationResponseSchema,
  rulebookAnnotatedIllustrationIdentitySchema,
  rulebookIllustrationConfigurationSchema,
} from '../src/shared/rulebooks/annotatedIllustration';
import type { RulebookAnnotatedIllustrationResolution } from '../src/shared/rulebooks/annotatedIllustration';
import { rulebookEditionContentsV1Schema } from '../src/shared/rulebooks/contents';
import { DEFAULT_RULEBOOK_SETTINGS } from '../src/shared/rulebooks/settings';
import { RULEBOOK_STOCK_ARTWORK, rulebookArtworkName } from '../src/shared/rulebooks/sources';
import type { RulebookSourceReference } from '../src/shared/rulebooks/sources';
import { internalQuery } from './_generated/server';
import { assetDisplayName } from './lib/assetInput';
import { currentFactionLeaderData } from './lib/publication';
import { rulebookForArtifactDelivery } from './lib/rulebookEditionArtifacts';
import { contentsForRulebookEdition } from './lib/rulebookEditionContents';
import type { QueryCtx } from './types';

type SourceResolution = Extract<RulebookAnnotatedIllustrationResolution, { status: 'found' }>['source'];

async function resolveSource(ctx: QueryCtx, reference: RulebookSourceReference | undefined): Promise<SourceResolution> {
  if (!reference) {
    return { status: 'unavailable' };
  }
  if (reference.kind === 'stock') {
    return RULEBOOK_STOCK_ARTWORK.some((id) => id === reference.artworkId)
      ? { status: 'stock', reference, artworkId: reference.artworkId, name: rulebookArtworkName(reference.artworkId) }
      : { status: 'unavailable' };
  }
  if (reference.kind === 'faction') {
    const id = ctx.db.normalizeId('factions', reference.factionId);
    const faction = id ? await ctx.db.get('factions', id) : null;
    const parsed = faction && !faction.is_deleted ? CanonicalFactionStoredSchema.safeParse(faction.data) : null;
    return parsed?.success && RULEBOOK_STOCK_ARTWORK.some((id) => id === parsed.data.logo)
      ? { status: 'stock', reference, artworkId: parsed.data.logo, name: parsed.data.name }
      : { status: 'unavailable' };
  }
  if (reference.kind === 'board') {
    return { status: 'board', boardId: reference.boardId };
  }
  if (reference.kind === 'faction-member') {
    if (!parseFactionMemberPublicationId(`${reference.factionId}.${reference.memberId}`)) {
      return { status: 'unavailable' };
    }
    const assetId = factionMemberPublicationId(reference.factionId, reference.memberId);
    const current = await currentFactionLeaderData(ctx, assetId);
    return current
      ? resolvePublication(ctx, reference, 'faction-leader', assetId, current.leader.name)
      : { status: 'unavailable' };
  }
  if (reference.kind !== 'asset') {
    return { status: 'unavailable' };
  }
  const assetId = ctx.db.normalizeId('assets', reference.assetId);
  const asset = assetId ? await ctx.db.get('assets', assetId) : null;
  if (!asset || asset.is_deleted || (!isComponentAssetType(asset.type) && asset.type !== 'deck')) {
    return { status: 'unavailable' };
  }
  if (asset.type === 'deck') {
    const publication = await ctx.db
      .query('publication_assets')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'deck').eq('asset_id', asset._id))
      .unique();
    return publication
      ? {
          status: 'image',
          reference,
          name: assetDisplayName(asset),
          assetType: 'deck',
          assetId: asset._id,
          revision: publication.cache_token,
        }
      : { status: 'pending' };
  }
  return resolvePublication(ctx, reference, asset.type, asset._id, assetDisplayName(asset));
}

async function resolvePublication(
  ctx: QueryCtx,
  reference: RulebookSourceReference,
  assetType: Extract<SourceResolution, { status: 'published' }>['assetType'],
  assetId: string,
  name: string
): Promise<SourceResolution> {
  const publication = await ctx.db
    .query('publication_assets')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', assetType).eq('asset_id', assetId))
    .unique();
  if (!publication || !publication.component_geometry) {
    return { status: 'pending' };
  }
  return {
    status: 'published',
    reference,
    name,
    assetType,
    assetId,
    revision: publication.cache_token,
    publishedAt: publication.published_at,
  };
}

/** Resolves immutable annotation choices under the same live Rulebook and Ruleset gates as Edition artifacts. */
export const resolveDelivery = internalQuery({
  args: { rulebookId: v.string(), editionNumber: v.number(), pageId: v.string(), blockId: v.string() },
  returns: zodToConvex(resolveRulebookAnnotatedIllustrationResponseSchema),
  handler: async (ctx, args): Promise<RulebookAnnotatedIllustrationResolution> => {
    const identity = rulebookAnnotatedIllustrationIdentitySchema.safeParse(args);
    if (!identity.success) {
      return { ok: true, status: 'missing' };
    }
    const rulebook = await rulebookForArtifactDelivery(ctx, args.rulebookId);
    if (!rulebook) {
      return { ok: true, status: 'missing' };
    }
    const edition = await ctx.db
      .query('rulebook_editions')
      .withIndex('by_rulebook_and_edition_number', (q) =>
        q.eq('rulebook_id', rulebook._id).eq('edition_number', args.editionNumber)
      )
      .unique();
    if (!edition) {
      return { ok: true, status: 'missing' };
    }
    const parsed = rulebookEditionContentsV1Schema.safeParse(await contentsForRulebookEdition(ctx, edition));
    const page =
      parsed.success && parsed.data.pageOrder.includes(args.pageId) ? parsed.data.pagesById[args.pageId] : null;
    const block = page?.blocksById[args.blockId];
    if (
      !page ||
      block?.kind !== 'asset-explainer' ||
      !Object.values(page.blockOrderByRegion).some((ids) => ids.includes(args.blockId))
    ) {
      return { ok: true, status: 'missing' };
    }
    const configuration = rulebookIllustrationConfigurationSchema.parse({
      source: block.source,
      numbering: block.numbering,
      colorMode: block.colorMode,
      items: block.itemOrder.map((id) => {
        const { text: _text, ...item } = block.itemsById[id]!;
        return item;
      }),
    });
    return {
      ok: true,
      status: 'found',
      design: (edition.settings ?? DEFAULT_RULEBOOK_SETTINGS).design,
      configuration,
      source: await resolveSource(ctx, configuration.source),
    };
  },
});
