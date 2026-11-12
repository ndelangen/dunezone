import SHA256 from 'crypto-js/sha256';

import { FACTION_LEADER_ASSET_TYPE } from '../../src/shared/asset-publishing/componentPublication';
import { FACTION_TRAITOR_ASSET_TYPE } from '../../src/shared/asset-publishing/factionCardPublication';
import { FACTION_TROOP_ASSET_TYPE } from '../../src/shared/asset-publishing/factionTroopPublication';
import { parsePublicationAssetData } from '../../src/shared/asset-publishing/publication';
import type { QueryCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';

/**
 * Faces whose drawing depends only on content that variants of one faction can share (#2922).
 * The alliance card is left out: it mixes the faction's name and rules with its first troop.
 */
const REUSABLE_ASSET_TYPES = [FACTION_LEADER_ASSET_TYPE, FACTION_TRAITOR_ASSET_TYPE, FACTION_TROOP_ASSET_TYPE] as const;
type ReusableAssetType = (typeof REUSABLE_ASSET_TYPES)[number];

const isReusable = (assetType: string): assetType is ReusableAssetType =>
  (REUSABLE_ASSET_TYPES as readonly string[]).includes(assetType);

/** What the renderer draws: a leader's ids only label the capture, so they are left out; the other faces carry no ids. */
function drawnContent(assetType: string, payload: unknown): unknown {
  if (assetType !== FACTION_LEADER_ASSET_TYPE) {
    return payload;
  }
  const { factionId: _factionId, memberId: _memberId, ...drawn } = payload as Record<string, unknown>;
  return drawn;
}

/**
 * The key two captures share when they would draw identical pixels: the face type, the renderer revision and the drawn content, with the payload it was read from.
 * Null for a face that is never reused, a type with no active revision, or a payload that does not parse, which then captures as before.
 */
export function captureContent(assetType: string, rendererRevision: number | undefined, assetData: unknown) {
  if (!rendererRevision || !isReusable(assetType)) {
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
 * The key already names the face type, and completion stores a key only with a valid capture, so any other asset holding it will do.
 * The job's own asset is never its source: republishing identical content over itself gains nothing.
 */
export async function reusableCapture(ctx: Pick<QueryCtx, 'db'>, assetId: string, contentKey: string) {
  const candidates = await ctx.db
    .query('publication_assets')
    .withIndex('by_content_key', (q) => q.eq('content_key', contentKey))
    .take(2);
  const source = candidates.find((candidate) => candidate.asset_id !== assetId);
  return source ? { assetId: source.asset_id, cacheToken: source.cache_token } : null;
}

/** Whether a capture of this exact content is in progress, so its file will be reusable once it lands. */
export async function isBeingCaptured(ctx: Pick<QueryCtx, 'db'>, contentKey: string) {
  const capturing = await ctx.db
    .query('publication_jobs')
    .withIndex('by_content_key_and_status', (q) => q.eq('content_key', contentKey).eq('status', 'in_progress'))
    .first();
  return capturing !== null;
}
