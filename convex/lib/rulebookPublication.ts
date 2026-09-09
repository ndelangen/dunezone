import { RULEBOOK_FIRST_PAGE_ASSET_TYPE } from '../../src/shared/asset-publishing/publication';
import { publishedHref } from '../../src/shared/asset-publishing/publicationTargets';
import { rulebookEditionContentsV1Schema } from '../../src/shared/rulebooks/contents';
import type { RulebookEditionContentsV1 } from '../../src/shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '../../src/shared/rulebooks/projectRenderDocument';
import type {
  RulebookResolvedAssetsById,
  RulebookResolvedFactionsById,
} from '../../src/shared/rulebooks/projectRenderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from '../../src/shared/rulebooks/settings';
import type { RulebookSettings } from '../../src/shared/rulebooks/settings';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { enqueuePublicationJob } from './publication';
import { contentsForRulebookEdition } from './rulebookEditionContents';
import { resolveRulebookReferences } from './rulebookReferences';

type RulebookPublicationReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;
type EditionIdentity = Pick<
  Doc<'rulebook_editions'>,
  '_id' | 'rulebook_id' | 'edition_number' | 'contents' | 'settings'
>;
async function resolvedAssetsForEdition(ctx: RulebookPublicationReadCtx, contents: unknown) {
  const parsed = rulebookEditionContentsV1Schema.safeParse(contents);
  if (!parsed.success) {
    return null;
  }
  return { ...(await resolveRulebookReferences(ctx, parsed.data)), contents: parsed.data };
}

/** Resolves one immutable Edition and proves the complete publishable render document. */
export async function rulebookRenderDocumentForEdition(ctx: RulebookPublicationReadCtx, edition: EditionIdentity) {
  const resolved = await resolvedAssetsForEdition(ctx, await contentsForRulebookEdition(ctx, edition));
  if (!resolved) {
    return null;
  }
  try {
    return projectRulebookRenderDocument(
      resolved.contents,
      resolved.assetsById,
      edition.settings ?? DEFAULT_RULEBOOK_SETTINGS,
      resolved.factionsById
    );
  } catch {
    return null;
  }
}

/**
 * The Edition's first rendered Page, or null when the stored Contents no longer project into a renderable document.
 * The projection parses, so a catalogue change that a permanent Edition predates surfaces here rather than as a throw.
 */
function firstRenderedPage(
  contents: RulebookEditionContentsV1,
  assetsById: RulebookResolvedAssetsById,
  settings: RulebookSettings,
  factionsById: RulebookResolvedFactionsById
) {
  try {
    const document = projectRulebookRenderDocument(contents, assetsById, settings, factionsById);
    const firstPageId = document.pageOrder[0];
    return firstPageId ? (document.pagesById[firstPageId] ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Why one Edition contributed no first-page image.
 * An Edition keeps the V1 read contract that minted it, including formatted text whose canonical spelling later changed.
 * These skips therefore mean the stored structure is corrupt or has no first Page;
 * either row must be reported without ending a batch that can still publish its neighbours.
 */
export type RulebookFirstPageSkip = 'unreadable-contents' | 'no-first-page';

export type RulebookFirstPageEnqueueResult =
  | Readonly<{ enqueued: true }>
  | Readonly<{ enqueued: false; skipped: RulebookFirstPageSkip }>;

/** Builds and queues the immutable first-page image for one Edition, or reports why it could not. */
export async function enqueueRulebookFirstPagePublication(
  ctx: MutationCtx,
  edition: EditionIdentity
): Promise<RulebookFirstPageEnqueueResult> {
  const resolved = await resolvedAssetsForEdition(ctx, await contentsForRulebookEdition(ctx, edition));
  if (!resolved) {
    return { enqueued: false, skipped: 'unreadable-contents' };
  }
  const settings = edition.settings ?? DEFAULT_RULEBOOK_SETTINGS;
  const page = firstRenderedPage(resolved.contents, resolved.assetsById, settings, resolved.factionsById);
  if (!page) {
    return { enqueued: false, skipped: 'no-first-page' };
  }
  await enqueuePublicationJob(ctx, {
    assetType: RULEBOOK_FIRST_PAGE_ASSET_TYPE,
    assetId: edition._id,
    assetData: {
      rulebookId: edition.rulebook_id,
      editionId: edition._id,
      editionNumber: edition.edition_number,
      page,
      settings,
    },
  });
  return { enqueued: true };
}

export type RulebookFirstPageCaptureStatus = 'scheduled' | 'in_progress' | 'failed' | null;

/** Projects the current image and any replacement work without hiding a usable image behind capture state. */
export async function rulebookFirstPagePublicationStatus(ctx: RulebookPublicationReadCtx, editionId: string) {
  const [assets, jobs] = await Promise.all([
    ctx.db
      .query('publication_assets')
      .withIndex('by_asset_type_and_asset_id', (q) =>
        q.eq('asset_type', RULEBOOK_FIRST_PAGE_ASSET_TYPE).eq('asset_id', editionId)
      )
      .take(2),
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) =>
        q.eq('asset_type', RULEBOOK_FIRST_PAGE_ASSET_TYPE).eq('asset_id', editionId)
      )
      .take(4),
  ]);
  if (assets.length > 1) {
    throw new Error('Publication invariant violated: duplicate Rulebook first-page assets');
  }
  const captureStatus: RulebookFirstPageCaptureStatus = jobs.some((job) => job.status === 'in_progress')
    ? 'in_progress'
    : jobs.some((job) => job.status === 'pending')
      ? 'scheduled'
      : jobs.some((job) => job.status === 'error')
        ? 'failed'
        : null;
  const asset = assets[0];
  return {
    imageUrl: asset ? publishedHref(RULEBOOK_FIRST_PAGE_ASSET_TYPE, asset.asset_id, asset.cache_token) : null,
    captureStatus,
  };
}
