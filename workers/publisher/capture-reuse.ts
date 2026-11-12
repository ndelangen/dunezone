import { Buffer } from 'node:buffer';

import type { ComponentGeometry } from '../../src/shared/asset-publishing/componentGeometry';
import { FACTION_LEADER_ASSET_TYPE } from '../../src/shared/asset-publishing/componentPublication';
import { PUBLICATION_TARGETS, publishedR2Key } from '../../src/shared/asset-publishing/publicationTargets';
import { readComponentEnvelope } from './component-r2';
import type { AssignedPublicationJob } from './convex';
import type { PublicAssetBucket } from './delivery';
import { PUBLISHER_CACHE_TOKEN_METADATA_KEY } from './r2';

export type ReusedCapture = {
  bytes: Uint8Array;
  payloadHash: string;
  componentGeometry?: ComponentGeometry;
};

/**
 * The finished file Convex named as drawing exactly this job's content (#2922), read back for publishing under the job's own id.
 * Null whenever the source no longer matches what Convex recorded, such as a plain image overwritten by a newer capture since;
 * the caller then renders as usual.
 */
export async function readReusableCapture(
  bucket: Pick<PublicAssetBucket, 'get' | 'head'>,
  item: AssignedPublicationJob
): Promise<ReusedCapture | null> {
  const reuse = item.reuse;
  if (!reuse) {
    return null;
  }
  if (item.assetType === FACTION_LEADER_ASSET_TYPE) {
    const envelope = await readComponentEnvelope(bucket, reuse.assetId, reuse.cacheToken, FACTION_LEADER_ASSET_TYPE);
    if (!envelope) {
      return null;
    }
    return {
      bytes: new Uint8Array(Buffer.from(envelope.image.base64, 'base64')),
      payloadHash: reuse.payloadHash,
      componentGeometry: envelope.geometry,
    };
  }
  const object = await bucket.get(publishedR2Key(item.assetType, reuse.assetId));
  if (!object || !('body' in object)) {
    return null;
  }
  const plan = PUBLICATION_TARGETS[item.assetType].capture;
  if (
    plan.output !== 'image' ||
    object.customMetadata?.[PUBLISHER_CACHE_TOKEN_METADATA_KEY] !== reuse.cacheToken ||
    object.size <= 0 ||
    object.size > plan.maxBytes
  ) {
    await object.body.cancel();
    return null;
  }
  return { bytes: new Uint8Array(await new Response(object.body).arrayBuffer()), payloadHash: reuse.payloadHash };
}
