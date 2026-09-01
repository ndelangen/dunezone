import {
  planRulebookPdfBatches,
  RULEBOOK_PDF_CAPTURE_TTL_MS,
  rulebookPdfCaptureBundleSchema,
  rulebookPdfCaptureSnapshotSchema,
} from '../../src/shared/rulebooks/pdfPublication';
import type {
  AssignedRulebookPdfJob,
  RulebookPdfCaptureBundle,
  RulebookPdfCaptureSnapshot,
} from '../../src/shared/rulebooks/pdfPublication';
import { RulebookPdfGenerationError } from './rulebook-pdf';

const CAPTURE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const MAX_CAPTURE_BUNDLE_BYTES = 8_000_000;
const encoder = new TextEncoder();

export type RulebookPdfCaptureBucket = Pick<R2Bucket, 'delete' | 'get' | 'head' | 'put'>;

function captureKey(token: string) {
  return `private/rulebook-pdf-captures/${token}.json`;
}

function captureToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function payloadHash(payload: RulebookPdfCaptureSnapshot['payload']) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(payload)));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/** Builds every batch from one in-memory render document before the Browser opens. */
async function buildRulebookPdfCaptureBundle(
  job: AssignedRulebookPdfJob,
  now: number
): Promise<RulebookPdfCaptureBundle> {
  const planned = planRulebookPdfBatches(
    {
      artifactId: job.artifactId,
      editionId: job.editionId,
      rulebookId: job.rulebookId,
      editionNumber: job.editionNumber,
    },
    job.document
  );
  if (planned.length === 0) {
    throw new RulebookPdfGenerationError('Rulebook PDF cannot capture an Edition without Pages');
  }
  const batches = await Promise.all(
    planned.map(async (payload) =>
      rulebookPdfCaptureSnapshotSchema.parse({
        ok: true,
        assetType: 'rulebook-pdf-batch',
        payload,
        payloadHash: await payloadHash(payload),
      })
    )
  );
  return rulebookPdfCaptureBundleSchema.parse({
    schemaVersion: 1,
    expiresAt: now + RULEBOOK_PDF_CAPTURE_TTL_MS,
    batches,
  });
}

/** Stores a private short-lived capture bundle under a random credential. */
export async function stageRulebookPdfCapture(
  bucket: RulebookPdfCaptureBucket,
  job: AssignedRulebookPdfJob,
  now: number
): Promise<{ token: string; bundle: RulebookPdfCaptureBundle }> {
  const bundle = await buildRulebookPdfCaptureBundle(job, now);
  const bytes = encoder.encode(JSON.stringify(bundle));
  if (bytes.byteLength > MAX_CAPTURE_BUNDLE_BYTES) {
    throw new RulebookPdfGenerationError('Rulebook PDF capture bundle exceeds its bounded staging size');
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = captureToken();
    const written = await bucket.put(captureKey(token), bytes, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: {
        kind: 'rulebook-pdf-capture',
        artifactId: job.artifactId,
        expiresAt: String(bundle.expiresAt),
      },
    });
    if (written) {
      return { token, bundle };
    }
  }
  throw new Error('Unable to reserve a private Rulebook PDF capture credential');
}

export function isRulebookPdfCaptureToken(value: string | undefined): value is string {
  return value !== undefined && CAPTURE_TOKEN_PATTERN.test(value);
}

/** Checks the private capture credential without reading the staged render document. */
export async function hasRulebookPdfCapture(
  bucket: RulebookPdfCaptureBucket,
  token: string,
  now: number
): Promise<boolean> {
  if (!isRulebookPdfCaptureToken(token)) {
    return false;
  }
  const object = await bucket.head(captureKey(token));
  const expiresAt = Number(object?.customMetadata?.expiresAt);
  return object?.customMetadata?.kind === 'rulebook-pdf-capture' && Number.isSafeInteger(expiresAt) && expiresAt >= now;
}

/** Loads one planned batch from the private bundle, with the stored expiry as the authority. */
export async function readRulebookPdfCaptureBatch(
  bucket: RulebookPdfCaptureBucket,
  token: string,
  batchIndex: number,
  now: number
): Promise<RulebookPdfCaptureSnapshot | null> {
  if (!isRulebookPdfCaptureToken(token) || !Number.isSafeInteger(batchIndex) || batchIndex < 0) {
    return null;
  }
  const object = await bucket.get(captureKey(token));
  if (!object || object.size > MAX_CAPTURE_BUNDLE_BYTES) {
    return null;
  }
  let parsed: RulebookPdfCaptureBundle;
  try {
    parsed = rulebookPdfCaptureBundleSchema.parse(JSON.parse(await object.text()));
  } catch {
    return null;
  }
  return parsed.expiresAt >= now ? (parsed.batches[batchIndex] ?? null) : null;
}

export async function removeRulebookPdfCapture(bucket: RulebookPdfCaptureBucket, token: string) {
  if (isRulebookPdfCaptureToken(token)) {
    await bucket.delete(captureKey(token));
  }
}
