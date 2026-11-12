import { Buffer } from 'node:buffer';

import type { ComponentGeometry } from '../../src/shared/asset-publishing/componentGeometry';
import { FACTION_LEADER_ASSET_TYPE } from '../../src/shared/asset-publishing/componentPublication';
import { PUBLICATION_TARGETS, publishedR2Key } from '../../src/shared/asset-publishing/publicationTargets';
import type { PublicationAssetType } from '../../src/shared/asset-publishing/publicationTargets';
import { readComponentEnvelope } from './component-r2';
import type { AssignedPublicationJob } from './convex';
import type { PublicAssetBucket } from './delivery';
import { PUBLISHER_CACHE_TOKEN_METADATA_KEY } from './r2';

export type ReusedCapture = {
  bytes: Uint8Array;
  payloadHash: string;
  componentGeometry?: ComponentGeometry;
};

type Reuse = NonNullable<AssignedPublicationJob['reuse']>;
type ReadableBucket = Pick<PublicAssetBucket, 'get'>;

/**
 * The finished file Convex named as drawing exactly this job's content (#2922), read back for publishing under the job's own id.
 * Null when the bucket cannot read, or the source no longer matches what Convex recorded, such as a plain image overwritten by a newer capture since.
 * A failure to read is a miss rather than a job failure: the caller renders, which produces the same image.
 */
export async function readReusableCapture(
  bucket: Partial<ReadableBucket>,
  item: AssignedPublicationJob
): Promise<ReusedCapture | null> {
  if (!item.reuse || !bucket.get) {
    return null;
  }
  const source = { get: bucket.get.bind(bucket) };
  try {
    const copy =
      item.assetType === FACTION_LEADER_ASSET_TYPE
        ? await readLeaderCapture(source, item.reuse)
        : await readImageCapture(source, item.assetType, item.reuse);
    return copy && { ...copy, payloadHash: item.reuse.payloadHash };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'publisher.capture_reuse_failed',
        jobId: item.jobId,
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return null;
  }
}

/** A leader's envelope is immutable under its revision, so finding it is enough. */
async function readLeaderCapture(bucket: ReadableBucket, reuse: Reuse) {
  const envelope = await readComponentEnvelope(bucket, reuse.assetId, reuse.cacheToken, FACTION_LEADER_ASSET_TYPE);
  if (!envelope) {
    return null;
  }
  return { bytes: new Uint8Array(Buffer.from(envelope.image.base64, 'base64')), componentGeometry: envelope.geometry };
}

/** A plain image is overwritten in place, so it is used only while it still carries the capture's cache token and an image's size. */
function isRecordedImage(object: R2Object, assetType: PublicationAssetType, cacheToken: string) {
  const plan = PUBLICATION_TARGETS[assetType].capture;
  const maximum = plan.output === 'image' ? plan.maxBytes : 0;
  const recorded = object.customMetadata?.[PUBLISHER_CACHE_TOKEN_METADATA_KEY] === cacheToken;
  return recorded && object.size > 0 && object.size <= maximum;
}

async function readImageCapture(bucket: ReadableBucket, assetType: PublicationAssetType, reuse: Reuse) {
  const object = await bucket.get(publishedR2Key(assetType, reuse.assetId));
  if (!object || !('body' in object)) {
    return null;
  }
  if (!isRecordedImage(object, assetType, reuse.cacheToken)) {
    await object.body.cancel();
    return null;
  }
  return { bytes: new Uint8Array(await new Response(object.body).arrayBuffer()) };
}
