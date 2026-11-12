import SHA256 from 'crypto-js/sha256';
import { z } from 'zod';

import { FACTION_LEADER_ASSET_TYPE } from '../../src/shared/asset-publishing/componentPublication';
import { FACTION_TRAITOR_ASSET_TYPE } from '../../src/shared/asset-publishing/factionCardPublication';
import { FACTION_TROOP_ASSET_TYPE } from '../../src/shared/asset-publishing/factionTroopPublication';
import { parsePublicationAssetData } from '../../src/shared/asset-publishing/publication';
import { isPublicationAssetType } from '../../src/shared/asset-publishing/publicationTargets';
import type { PublicationAssetType } from '../../src/shared/asset-publishing/publicationTargets';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';

/**
 * Faces whose drawing depends only on content that variants of one faction can share (#2922).
 * The alliance card is left out: it mixes the faction's name and rules with its first troop.
 */
const REUSABLE_ASSET_TYPES: ReadonlySet<string> = new Set([
  FACTION_LEADER_ASSET_TYPE,
  FACTION_TRAITOR_ASSET_TYPE,
  FACTION_TROOP_ASSET_TYPE,
]);

/** A component capture lives in an envelope keyed by its revision, which only a UUID names. */
const componentRevisionSchema = z.uuid();

/** What the renderer draws: a leader's ids only label the capture, so they are left out; the other faces carry no ids. */
function drawnContent(assetType: string, payload: unknown): unknown {
  if (assetType !== FACTION_LEADER_ASSET_TYPE) {
    return payload;
  }
  const { factionId: _factionId, memberId: _memberId, ...drawn } = payload as Record<string, unknown>;
  return drawn;
}

/** A type that is reused and has an active revision to key its captures by. */
function isReusable(assetType: string, rendererRevision: number | undefined): assetType is PublicationAssetType {
  return REUSABLE_ASSET_TYPES.has(assetType) && Boolean(rendererRevision) && isPublicationAssetType(assetType);
}

/**
 * The key two captures share when they would draw identical pixels: the face type, the renderer revision and the drawn content, with the payload it was read from.
 * Null for a face that is never reused, a type with no active revision, or a payload that does not parse, which then captures as before.
 */
export function captureContent(assetType: string, rendererRevision: number | undefined, assetData: unknown) {
  if (!isReusable(assetType, rendererRevision)) {
    return null;
  }
  let payload: unknown;
  try {
    payload = parsePublicationAssetData(assetType, assetData);
  } catch {
    return null;
  }
  const key = SHA256(
    canonicalJson({ assetType, rendererRevision, drawn: drawnContent(assetType, payload) })
  ).toString();
  return { key, payload };
}

/**
 * Another publication's finished capture with this key, which the publisher may copy instead of rendering.
 * The job's own asset is never its source: republishing identical content over itself gains nothing.
 */
export async function reusableCapture(
  ctx: Pick<QueryCtx, 'db'>,
  job: Pick<Doc<'publication_jobs'>, 'asset_type' | 'asset_id'>,
  contentKey: string
) {
  const candidates = await ctx.db
    .query('publication_assets')
    .withIndex('by_content_key', (q) => q.eq('content_key', contentKey))
    .take(4);
  const source = candidates.find(
    (candidate) =>
      candidate.asset_type === job.asset_type &&
      candidate.asset_id !== job.asset_id &&
      (job.asset_type !== FACTION_LEADER_ASSET_TYPE || componentRevisionSchema.safeParse(candidate.cache_token).success)
  );
  return source ? { assetId: source.asset_id, cacheToken: source.cache_token } : null;
}
