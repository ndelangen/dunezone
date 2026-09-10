import { Buffer } from 'node:buffer';

import type { ComponentGeometry } from '../../src/shared/asset-publishing/componentGeometry';
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
  const envelope = componentPublicationEnvelopeSchema.parse({
    schemaVersion: 1,
    assetId: job.assetId,
    revision,
    payloadHash,
    geometry,
    image: { contentType: 'image/jpeg', base64: Buffer.from(jpeg).toString('base64') },
  });
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  if (bytes.byteLength > COMPONENT_ENVELOPE_MAX_BYTES) {
    throw new Error('Component publication exceeds its size limit');
  }
  const written = await bucket.put(componentEnvelopeKey(job.assetId, revision), bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json' },
  });
  if (!written) {
    throw new Error('Component publication was not written');
  }
}

/** The private envelope is bounded and validated before any contained image or named part is used. */
export async function readComponentEnvelope(bucket: PublicAssetBucket, assetId: string, revision: string) {
  const object = await bucket.get(componentEnvelopeKey(assetId, revision));
  if (!object || !('body' in object)) {
    return null;
  }
  if (object.size > COMPONENT_ENVELOPE_MAX_BYTES) {
    await object.body.cancel();
    throw new Error('Component publication exceeds its size limit');
  }
  const value = await readBoundedJson(new Response(object.body), COMPONENT_ENVELOPE_MAX_BYTES);
  const envelope = componentPublicationEnvelopeSchema.parse(value);
  if (envelope.assetId !== assetId || envelope.revision !== revision) {
    throw new Error('Component publication identity differs');
  }
  return envelope;
}
