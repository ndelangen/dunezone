import { componentGeometrySchema } from '../../src/shared/asset-publishing/componentGeometry';
import { factionMemberPublicationId } from '../../src/shared/asset-publishing/componentPublication';
import {
  isPublicationAssetType,
  publishedHref,
  resolvePublicationCapture,
} from '../../src/shared/asset-publishing/publicationTargets';
import { parseBoardData } from '../../src/shared/assets/validation';
import { BoardAsset } from '../../src/shared/boards/schema';
import { CanonicalFactionStoredSchema, TroopArtwork } from '../../src/shared/factions/schema';
import type { RulebookEditionContentsV1 } from '../../src/shared/rulebooks/contents';
import type {
  RulebookResolvedAssetsById,
  RulebookResolvedFactionsById,
} from '../../src/shared/rulebooks/projectRenderDocument';
import { collectRulebookReferenceIds } from '../../src/shared/rulebooks/references';
import { rulebookFactionSheetSchema } from '../../src/shared/rulebooks/sources';
import type { RulebookResolvedSource } from '../../src/shared/rulebooks/sources';
import type { MutationCtx, QueryCtx } from '../types';
import { assetDisplayName } from './assetInput';
import { resolveBackgrounds } from './backgroundPresets';
import { boardPublicationGeometry } from './boardPublicationGeometry';
import { resolveRulebookTroopSource, rulebookTroopReferences } from './rulebookTroopSources';

type ReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;

/**
 * A saved board publishes only its image and stores the territories of the save it captured beside it.
 * A publication from before that keeps none;
 * its territories are read from the board's own data only while no capture of a newer save is queued, running or failed, since only then does the image show that data.
 */
async function savedBoardGeometry(ctx: ReadCtx, assetId: string, data: unknown, stored: unknown) {
  if (stored) {
    return stored;
  }
  const newerCapture = await ctx.db
    .query('publication_jobs')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'board').eq('asset_id', assetId))
    .first();
  if (newerCapture) {
    return null;
  }
  try {
    return boardPublicationGeometry(parseBoardData(data).board) ?? null;
  } catch {
    return null;
  }
}

/**
 * A saved board's data for drawing markup on it, checked for shape only: deriving its territories here would cost every evaluation of a reactive query.
 * The scene works its territories out where it draws them, and leaves its tints out if the board does not draw.
 * While a newer capture of the board is pending or has failed, its image still shows the board as it was, so the data is held back rather than drawing tints that no longer line up with it.
 */
async function capturedBoardData(ctx: ReadCtx, assetId: string, data: unknown) {
  const newerCapture = await ctx.db
    .query('publication_jobs')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'board').eq('asset_id', assetId))
    .first();
  if (newerCapture) {
    return {};
  }
  const parsed = BoardAsset.safeParse(data);
  return parsed.success ? { board: parsed.data.board } : {};
}

/** Resolves only the live sources this Contents references, for both the reader and publication. */
export async function resolveRulebookReferences(
  ctx: ReadCtx,
  contents: RulebookEditionContentsV1,
  requested: {
    assetIds?: readonly string[];
    factionIds?: readonly string[];
    factionTokenImages?: boolean;
    factionSheetData?: boolean;
    /** Every saved board's data, for an editor that paints tints; readers get it only for boards a scene tints. */
    boardData?: boolean;
  } = {}
) {
  const {
    assetIds,
    factionIds,
    troopSources = [],
    traitorFactionIds = [],
    tokenFactionIds = [],
    sheetFactionIds = [],
    markupBoardIds = [],
  } = collectRulebookReferenceIds(contents, requested);
  const tinted = new Set(markupBoardIds);
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
        const capture = isPublicationAssetType(asset.type) ? resolvePublicationCapture(asset.type) : null;
        const geometry = componentGeometrySchema.safeParse(
          asset.type === 'board' && publication
            ? await savedBoardGeometry(ctx, assetId, asset.data, publication.component_geometry)
            : publication?.component_geometry
        );
        return [
          assetId,
          {
            assetId,
            name: assetDisplayName(asset),
            type: asset.type,
            ...(capture?.output === 'image' ? { width: capture.widthPx, height: capture.heightPx } : {}),
            ...(geometry.success ? { geometry: geometry.data, publicationRevision: publication!.cache_token } : {}),
            imageUrl:
              publication && isPublicationAssetType(asset.type)
                ? publishedHref(asset.type, assetId, publication.cache_token)
                : null,
            ...(asset.type === 'board' && (requested.boardData || tinted.has(assetId))
              ? await capturedBoardData(ctx, assetId, asset.data)
              : {}),
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
        const tokenPublication = await ctx.db
          .query('publication_assets')
          .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'faction-token').eq('asset_id', factionId))
          .unique();
        const background = parsed.data.background.colors[0];
        const color = typeof background === 'string' ? background : (background.stops[0]?.[0] ?? '#20394a');
        const members = await Promise.all(
          [parsed.data.factionLeader, ...parsed.data.leaders].map(async (member): Promise<RulebookResolvedSource> => {
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
                  ...(publication.component_geometry
                    ? {
                        geometry: componentGeometrySchema.parse(publication.component_geometry),
                        publicationRevision: publication.cache_token,
                      }
                    : {}),
                  width: 600,
                  height: 600,
                }
              : { status: 'unavailable', reference };
          })
        );
        const traitors = await Promise.all(
          (traitorFactionIds.includes(factionId) || requested.factionIds?.includes(factionId)
            ? parsed.data.leaders
            : []
          ).map(async (member): Promise<RulebookResolvedSource> => {
            const reference = {
              kind: 'faction-member' as const,
              factionId,
              memberId: member.memberId,
              presentation: 'traitor' as const,
            };
            const publicationId = factionMemberPublicationId(factionId, member.memberId);
            const publication = await ctx.db
              .query('publication_assets')
              .withIndex('by_asset_type_and_asset_id', (q) =>
                q.eq('asset_type', 'faction-traitor').eq('asset_id', publicationId)
              )
              .unique();
            return publication
              ? {
                  status: 'ready',
                  reference,
                  name: member.name,
                  imageUrl: publishedHref('faction-traitor', publicationId, publication.cache_token),
                  width: 900,
                  height: 1263,
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
            ...(tokenPublication && (requested.factionTokenImages !== false || tokenFactionIds.includes(factionId))
              ? { tokenImageUrl: publishedHref('faction-token', factionId, tokenPublication.cache_token) }
              : {}),
            token: { logo: parsed.data.logo, background: parsed.data.background },
            ...(sheetFactionIds.includes(factionId) ||
            (requested.factionSheetData && requested.factionIds?.includes(factionId))
              ? { sheet: await resolveBackgrounds(ctx, rulebookFactionSheetSchema.parse(parsed.data)) }
              : {}),
            troops: parsed.data.troops.map((troop) => {
              const { capable: _capable, combat: _combat, back, ...artwork } = troop;
              if (!back) {
                return TroopArtwork.parse(artwork);
              }
              const { capable: _backCapable, combat: _backCombat, ...backArtwork } = back;
              return TroopArtwork.parse({ ...artwork, back: backArtwork });
            }),
            troopSources: await Promise.all(
              (requested.factionIds?.includes(factionId)
                ? rulebookTroopReferences(factionId, parsed.data.troops)
                : troopSources.filter((source) => source.factionId === factionId)
              ).map((source) => resolveRulebookTroopSource(ctx, parsed.data.troops, source))
            ),
            ruler: members[0]!,
            leaders: members.slice(1),
            ...(traitors.length ? { traitors } : {}),
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
