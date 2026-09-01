import { rulebookEditionArtifactKey } from '../../src/shared/rulebooks/editionArtifacts';
import type { AssignedRulebookHtmlJob } from '../../src/shared/rulebooks/htmlPublication';
import { RulebookHtmlGenerationError } from './rulebook-html';

export const RULEBOOK_HTML_CONTENT_TYPE = 'text/html; charset=utf-8';

export type RulebookHtmlBucket = Pick<R2Bucket, 'head' | 'put'>;

async function contentSha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function metadataFor(job: AssignedRulebookHtmlJob, bytes: Uint8Array) {
  return {
    artifactId: job.artifactId,
    editionId: job.editionId,
    rulebookId: job.rulebookId,
    editionNumber: String(job.editionNumber),
    kind: 'html',
    contentLength: String(bytes.byteLength),
    contentSha256: await contentSha256(bytes),
  };
}

function matchesJob(object: R2Object, expected: Record<string, string>) {
  return Object.entries(expected).every(([key, value]) => object.customMetadata?.[key] === value);
}

/** Writes the first successful bytes at an Edition path and never replaces them. */
export async function putImmutableRulebookHtml(
  bucket: RulebookHtmlBucket,
  job: AssignedRulebookHtmlJob,
  bytes: Uint8Array
): Promise<{ key: string; created: boolean }> {
  const key = rulebookEditionArtifactKey(job.rulebookId, job.editionNumber, 'html');
  const customMetadata = await metadataFor(job, bytes);
  const written = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: RULEBOOK_HTML_CONTENT_TYPE },
    customMetadata,
  });
  if (written) {
    return { key, created: true };
  }

  const existing = await bucket.head(key);
  if (!existing || !matchesJob(existing, customMetadata)) {
    throw new RulebookHtmlGenerationError('Permanent Rulebook HTML path is occupied by different bytes');
  }
  return { key, created: false };
}
