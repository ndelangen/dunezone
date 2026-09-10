import { Buffer } from 'node:buffer';

import { publishedR2Key } from '../../src/shared/asset-publishing/publicationTargets';
import { rulebookAnnotatedIllustrationIdentitySchema } from '../../src/shared/rulebooks/annotatedIllustration';
import type {
  RulebookAnnotatedIllustrationIdentity,
  RulebookAnnotatedIllustrationResolution,
} from '../../src/shared/rulebooks/annotatedIllustration';
import {
  composeRulebookAssetExplainerSvg,
  projectRulebookAssetExplainerAnnotations,
  RULEBOOK_ANNOTATION_COMPOSITOR_REVISION,
} from '../../src/shared/rulebooks/assetExplainerAnnotations';
import { resolveRulebookBoardDefinition } from '../../src/shared/rulebooks/boardDefinitions';
import { resolveRulebookBoardIllustration } from '../../src/shared/rulebooks/boardIllustrations';
import type { RulebookResolvedSource } from '../../src/shared/rulebooks/sources';
import { readComponentEnvelope } from './component-r2';
import type { PublicAssetBucket } from './delivery';
import { jpegProfile } from './image-inspection';
import { PUBLISHER_CACHE_TOKEN_METADATA_KEY } from './r2';
import { loadRulebookStaticIllustration } from './rulebook-static-illustration';

export type RulebookIllustrationDeliveryClient = {
  resolveRulebookAnnotatedIllustration(
    identity: RulebookAnnotatedIllustrationIdentity
  ): Promise<RulebookAnnotatedIllustrationResolution>;
};
type FoundIllustration = Extract<RulebookAnnotatedIllustrationResolution, { status: 'found' }>;
type ImageInput = { source: RulebookResolvedSource; imageDataUrl?: string; publicationIdentity?: string };

function unavailable(status: number, message: string, headers?: HeadersInit) {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

async function imageInput(
  resolution: FoundIllustration,
  bucket: PublicAssetBucket,
  assets?: Pick<Fetcher, 'fetch'>
): Promise<ImageInput> {
  const reference = resolution.configuration.source;
  const unavailableSource: RulebookResolvedSource = reference
    ? { status: 'unavailable', reference }
    : { status: 'unselected' };
  const source = resolution.source;
  if (source.status === 'unavailable' || source.status === 'pending') {
    return { source: unavailableSource, publicationIdentity: source.status };
  }
  if (source.status === 'board') {
    const board = resolveRulebookBoardDefinition(source.boardId);
    const illustration = board && resolveRulebookBoardIllustration(board.id);
    if (
      !board ||
      !illustration ||
      illustration.revision !== board.revision ||
      reference?.kind !== 'board' ||
      reference.boardId !== board.id
    ) {
      return { source: unavailableSource, publicationIdentity: 'missing-board' };
    }
    return {
      source: {
        status: 'ready',
        reference,
        name: board.name,
        imageUrl: board.imageUrl,
        geometry: board.geometry,
        publicationRevision: board.revision,
      },
      imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(illustration.svg).toString('base64')}`,
      publicationIdentity: board.revision,
    };
  }
  if (source.status === 'stock') {
    const illustration = assets && (await loadRulebookStaticIllustration(source.artworkId, assets));
    if (!illustration) {
      return { source: unavailableSource, publicationIdentity: 'missing-artwork' };
    }
    return {
      source: {
        status: 'ready',
        reference: source.reference,
        name: source.name,
        imageUrl: illustration.imageDataUrl,
        width: illustration.width,
        height: illustration.height,
      },
      imageDataUrl: illustration.imageDataUrl,
      publicationIdentity: illustration.revision,
    };
  }
  if (source.status === 'image') {
    const object = await bucket.get(publishedR2Key(source.assetType, source.assetId));
    if (
      !object ||
      !('body' in object) ||
      object.size > 2_000_000 ||
      object.customMetadata?.[PUBLISHER_CACHE_TOKEN_METADATA_KEY] !== source.revision
    ) {
      throw new Error('Annotated image publication is unavailable');
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength > 2_000_000) {
      throw new Error('Annotated image publication is too large');
    }
    const { widthPx: width, heightPx: height } = jpegProfile(bytes);
    if (width <= 0 || height <= 0 || width > 20_000 || height > 20_000) {
      throw new Error('Annotated image dimensions are invalid');
    }
    const imageDataUrl = `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;
    return {
      source: {
        status: 'ready',
        reference: source.reference,
        name: source.name,
        imageUrl: imageDataUrl,
        width,
        height,
      },
      imageDataUrl,
      publicationIdentity: `${source.revision}:${await illustrationEtag(imageDataUrl)}`,
    };
  }
  const envelope = await readComponentEnvelope(bucket, source.assetId, source.revision, source.assetType);
  if (!envelope) {
    throw new Error('Annotated source publication is unavailable');
  }
  const imageDataUrl = `data:${envelope.image.contentType};base64,${envelope.image.base64}`;
  return {
    source: {
      status: 'ready',
      reference: source.reference,
      name: source.name,
      imageUrl: imageDataUrl,
      geometry: envelope.geometry,
      publicationRevision: envelope.revision,
    },
    imageDataUrl,
    publicationIdentity: `${source.assetType}:${envelope.assetId}:${envelope.revision}:${envelope.payloadHash}`,
  };
}

async function illustrationEtag(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return `"${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}"`;
}

function notModified(request: Request, etag: string) {
  return (
    request.headers
      .get('If-None-Match')
      ?.split(',')
      .some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag) ?? false
  );
}

/** Reads immutable choices and current source availability before returning or revalidating aligned image bytes. */
export async function handleRulebookIllustrationRequest(
  request: Request,
  identity: RulebookAnnotatedIllustrationIdentity,
  dependencies: {
    bucket: PublicAssetBucket;
    client: RulebookIllustrationDeliveryClient;
    assets?: Pick<Fetcher, 'fetch'>;
  }
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return unavailable(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  if (new URL(request.url).search || !rulebookAnnotatedIllustrationIdentitySchema.safeParse(identity).success) {
    return unavailable(400, 'Invalid Illustration Address');
  }
  try {
    const resolution = await dependencies.client.resolveRulebookAnnotatedIllustration(identity);
    if (resolution.status === 'missing') {
      return unavailable(404, 'Not Found');
    }
    const input = await imageInput(resolution, dependencies.bucket, dependencies.assets);
    const projection = projectRulebookAssetExplainerAnnotations(
      {
        ...resolution.configuration,
        source: input.source,
        items: resolution.configuration.items.map((item) => ({ ...item, text: '' })),
      },
      resolution.design
    );
    const etag = await illustrationEtag({
      identity,
      configuration: resolution.configuration,
      design: resolution.design,
      publication: input.publicationIdentity,
      projection,
      compositor: RULEBOOK_ANNOTATION_COMPOSITOR_REVISION,
    });
    const headers = new Headers({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      'Access-Control-Allow-Origin': '*',
      ETag: etag,
    });
    const svg = composeRulebookAssetExplainerSvg({ projection, imageDataUrl: input.imageDataUrl });
    const bytes = new TextEncoder().encode(svg);
    if (notModified(request, etag)) {
      return new Response(null, { status: 304, headers });
    }
    headers.set('Content-Length', String(bytes.byteLength));
    return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
  } catch {
    return unavailable(503, 'Illustration Temporarily Unavailable');
  }
}
