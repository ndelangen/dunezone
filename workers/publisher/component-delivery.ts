import { Buffer } from 'node:buffer';

import { z } from 'zod';

import type { ComponentAssetType } from '../../src/shared/asset-publishing/componentGeometry';
import type { ComponentDeliveryResolution } from '../../src/shared/asset-publishing/componentPublication';
import { readComponentEnvelope } from './component-r2';
import type { PublicAssetBucket } from './delivery';

export type ComponentDeliveryClient = {
  resolveComponentDelivery(assetId: string, assetType?: ComponentAssetType): Promise<ComponentDeliveryResolution>;
};

function unavailable(status: number, message: string) {
  return new Response(message, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Resolve source availability before conditional delivery. Retained or cached bytes cannot revive a removed member. */
export async function handleComponentRequest(
  request: Request,
  assetId: string,
  dependencies: { bucket: PublicAssetBucket; client: ComponentDeliveryClient },
  assetType: ComponentAssetType = 'faction-leader'
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
    });
  }
  try {
    const resolution = await dependencies.client.resolveComponentDelivery(assetId, assetType);
    if (resolution.status === 'missing') {
      return unavailable(404, 'Not Found');
    }
    if (resolution.status === 'pending') {
      return unavailable(503, 'Component Temporarily Unavailable');
    }
    const requestedRevision = new URL(request.url).searchParams.get('componentRevision');
    const revision = requestedRevision === null ? resolution.revision : z.uuid().parse(requestedRevision);
    const envelope = await readComponentEnvelope(dependencies.bucket, assetId, revision, assetType);
    if (!envelope) {
      return unavailable(503, 'Component Temporarily Unavailable');
    }
    const etag = `"${envelope.revision}"`;
    const headers = new Headers({
      'Content-Type': envelope.image.contentType,
      'Cache-Control': 'no-cache',
      ETag: etag,
      'Last-Modified': new Date(resolution.publishedAt).toUTCString(),
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    });
    const conditional = request.headers.get('If-None-Match');
    if (conditional?.split(',').some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag)) {
      return new Response(null, { status: 304, headers });
    }
    const bytes = Buffer.from(envelope.image.base64, 'base64');
    headers.set('Content-Length', String(bytes.byteLength));
    return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
  } catch {
    return unavailable(503, 'Component Temporarily Unavailable');
  }
}
