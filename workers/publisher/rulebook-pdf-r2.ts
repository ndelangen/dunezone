import { rulebookEditionArtifactKey } from '../../src/shared/rulebooks/editionArtifacts';
import type { AssignedRulebookPdfJob } from '../../src/shared/rulebooks/pdfPublication';
import { RulebookPdfGenerationError } from './rulebook-pdf';

export type RulebookPdfBucket = Pick<R2Bucket, 'head' | 'put'>;

async function contentSha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function metadataFor(job: AssignedRulebookPdfJob, bytes: Uint8Array, rendererIdentity: string) {
  return {
    artifactId: job.artifactId,
    editionId: job.editionId,
    rulebookId: job.rulebookId,
    editionNumber: String(job.editionNumber),
    kind: 'pdf',
    rendererIdentity,
    contentLength: String(bytes.byteLength),
    contentSha256: await contentSha256(bytes),
  };
}

function matchesJob(object: R2Object, expected: Record<string, string>) {
  return Object.entries(expected).every(([key, value]) => object.customMetadata?.[key] === value);
}

/** Writes the first complete PDF at its permanent Edition key and never replaces it. */
export async function putImmutableRulebookPdf(
  bucket: RulebookPdfBucket,
  job: AssignedRulebookPdfJob,
  bytes: Uint8Array,
  rendererIdentity: string
): Promise<{ key: string; created: boolean }> {
  const key = rulebookEditionArtifactKey(job.rulebookId, job.editionNumber, 'pdf');
  const customMetadata = await metadataFor(job, bytes, rendererIdentity);
  const written = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: {
      contentDisposition: 'attachment; filename="rulebook.pdf"',
      contentType: 'application/pdf',
    },
    customMetadata,
  });
  if (written) {
    return { key, created: true };
  }
  const existing = await bucket.head(key);
  if (!existing || !matchesJob(existing, customMetadata)) {
    throw new RulebookPdfGenerationError('Permanent Rulebook PDF path is occupied by different bytes');
  }
  return { key, created: false };
}
