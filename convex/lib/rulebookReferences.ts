import { factionMemberPublicationId } from '../../src/shared/asset-publishing/componentPublication';
import { isPublicationAssetType, publishedHref } from '../../src/shared/asset-publishing/publicationTargets';
import { CanonicalFactionStoredSchema } from '../../src/shared/factions/schema';
import type { RulebookEditionContentsV1 } from '../../src/shared/rulebooks/contents';
import type {
  RulebookResolvedAssetsById,
  RulebookResolvedFactionsById,
} from '../../src/shared/rulebooks/projectRenderDocument';
import { collectRulebookReferenceIds } from '../../src/shared/rulebooks/references';
import type { RulebookResolvedSource } from '../../src/shared/rulebooks/sources';
import type { MutationCtx, QueryCtx } from '../types';
import { assetDisplayName } from './assetInput';

type ReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;

/** Resolves only the live sources this Contents references, for both the reader and publication. */
export async function resolveRulebookReferences(
  ctx: ReadCtx,
  contents: RulebookEditionContentsV1,
  requested: { assetIds?: readonly string[]; factionIds?: readonly string[] } = {}
) {
  const { assetIds, factionIds } = collectRulebookReferenceIds(contents, requested);
  const [assets, factions] = await Promise.all([
    Promise.all(
      assetIds.map(async (assetId): Promise<readonly [string, RulebookResolvedAssetsById[string]] | null> => {
        const id = ctx.db.normalizeId('assets', assetId);
        const asset = id ? await ctx.db.get('assets', id) : null;
        if (!asset || asset.is_deleted) {
          return null;
        }
        const publication = isPublicationAssetType(asset.type)
          ? await ctx.db
              .query('publication_assets')
              .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', asset.type).eq('asset_id', assetId))
              .unique()
          : null;
        return [
          assetId,
          {
            assetId,
            name: assetDisplayName(asset),
            type: asset.type,
            imageUrl:
              publication && isPublicationAssetType(asset.type)
                ? publishedHref(asset.type, assetId, publication.cache_token)
                : null,
          },
        ];
      })
    ),
    Promise.all(
      factionIds.map(async (factionId): Promise<readonly [string, RulebookResolvedFactionsById[string]] | null> => {
        const id = ctx.db.normalizeId('factions', factionId);
        const faction = id ? await ctx.db.get('factions', id) : null;
        if (!faction || faction.is_deleted) {
          return null;
        }
        const parsed = CanonicalFactionStoredSchema.safeParse(faction.data);
        if (!parsed.success) {
          return null;
        }
        const background = parsed.data.background.colors[0];
        const color = typeof background === 'string' ? background : (background.stops[0]?.[0] ?? '#20394a');
        const members = await Promise.all(
          [parsed.data.hero, ...parsed.data.leaders].map(async (member): Promise<RulebookResolvedSource> => {
            if (!member.memberId) {
              return { status: 'unselected' };
            }
            const reference = { kind: 'faction-member' as const, factionId, memberId: member.memberId };
            const publicationId = factionMemberPublicationId(factionId, member.memberId);
            const publication = await ctx.db
              .query('publication_assets')
              .withIndex('by_asset_type_and_asset_id', (q) =>
                q.eq('asset_type', 'faction-leader').eq('asset_id', publicationId)
              )
              .unique();
            return publication
              ? {
                  status: 'ready',
                  reference,
                  name: member.name,
                  imageUrl: publishedHref('faction-leader', publicationId, publication.cache_token),
                  width: 600,
                  height: 600,
                }
              : { status: 'unavailable', reference };
          })
        );
        return [
          factionId,
          {
            factionId,
            name: parsed.data.name,
            color,
            emblemUrl: parsed.data.logo,
            ruler: members[0]!,
            leaders: members.slice(1),
          },
        ];
      })
    ),
  ]);
  return {
    assetsById: Object.fromEntries(assets.filter((entry) => entry !== null)),
    factionsById: Object.fromEntries(factions.filter((entry) => entry !== null)),
  };
}
