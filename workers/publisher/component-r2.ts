import { Buffer } from 'node:buffer';

import { isComponentAssetType } from '../../src/shared/asset-publishing/componentGeometry';
import type { ComponentAssetType, ComponentGeometry } from '../../src/shared/asset-publishing/componentGeometry';
import {
  COMPONENT_ENVELOPE_MAX_BYTES,
  componentEnvelopeKey,
  componentPublicationEnvelopeSchema,
} from '../../src/shared/asset-publishing/componentPublication';
import type { AssignedPublicationJob } from './convex';
import type { PublicAssetBucket } from './delivery';
import { readBoundedJson } from './http';
import type { AssetBucket } from './r2';

export async function putComponentEnvelope(
  bucket: AssetBucket,
  job: AssignedPublicationJob,
  payloadHash: string,
  revision: string,
  jpeg: Uint8Array,
  geometry: ComponentGeometry
): Promise<void> {
  if (!isComponentAssetType(job.assetType)) {
    throw new Error('Asset type has no component envelope');
  }
  const envelope = componentPublicationEnvelopeSchema.parse({
    schemaVersion: 1,
    assetId: job.assetId,
    assetType: job.assetType,
    revision,
    payloadHash,
    geometry,
    image: { contentType: 'image/jpeg', base64: Buffer.from(jpeg).toString('base64') },
  });
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  if (bytes.byteLength > COMPONENT_ENVELOPE_MAX_BYTES) {
    throw new Error('Component publication exceeds its size limit');
  }
  const written = await bucket.put(componentEnvelopeKey(job.assetId, revision, job.assetType), bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json' },
  });
  if (!written) {
    throw new Error('Component publication was not written');
  }
}

/** The private envelope is bounded and validated before any contained image or named part is used. */
export async function readComponentEnvelope(
  bucket: PublicAssetBucket,
  assetId: string,
  revision: string,
  assetType: ComponentAssetType = 'faction-leader'
) {
  const object = await bucket.get(componentEnvelopeKey(assetId, revision, assetType));
  if (!object || !('body' in object)) {
    return null;
  }
  if (object.size > COMPONENT_ENVELOPE_MAX_BYTES) {
    await object.body.cancel();
    throw new Error('Component publication exceeds its size limit');
  }
  const value = await readBoundedJson(new Response(object.body), COMPONENT_ENVELOPE_MAX_BYTES);
  const envelope = componentPublicationEnvelopeSchema.parse(value);
  if (
    envelope.assetId !== assetId ||
    envelope.revision !== revision ||
    (envelope.assetType ?? 'faction-leader') !== assetType
  ) {
    throw new Error('Component publication identity differs');
  }
  return envelope;
}
