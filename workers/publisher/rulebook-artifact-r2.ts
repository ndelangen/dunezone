import { rulebookEditionArtifactKey } from '../../src/shared/rulebooks/editionArtifacts';
import type { RulebookEditionArtifactKind } from '../../src/shared/rulebooks/editionArtifacts';
import type { AssignedRulebookArtifactJob } from '../../src/shared/rulebooks/editionArtifactWork';
import { RulebookHtmlGenerationError } from './rulebook-html';
import { RulebookPdfGenerationError } from './rulebook-pdf';

export type RulebookArtifactBucket = Pick<R2Bucket, 'head' | 'put'>;

/**
 * What each format stores differently at its permanent key.
 * Only the PDF records the Renderer identity: the HTML objects already stored carry none, so a reuse check that asked for one would refuse them.
 * The error class is the one that format's executor settles as a failed artifact rather than rethrowing.
 */
const artifactStorage = {
  html: {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    rendererMetadata: (_rendererIdentity: string) => ({}),
    GenerationError: RulebookHtmlGenerationError,
  },
  pdf: {
    httpMetadata: { contentDisposition: 'attachment; filename="rulebook.pdf"', contentType: 'application/pdf' },
    rendererMetadata: (rendererIdentity: string) => ({ rendererIdentity }),
    GenerationError: RulebookPdfGenerationError,
  },
} satisfies Record<
  RulebookEditionArtifactKind,
  {
    httpMetadata: R2HTTPMetadata;
    rendererMetadata: (rendererIdentity: string) => Record<string, string>;
    GenerationError: new (message: string) => Error;
  }
>;

async function contentSha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function matchesJob(object: R2Object, expected: Record<string, string>) {
  return Object.entries(expected).every(([key, value]) => object.customMetadata?.[key] === value);
}

/** Writes the first successful bytes at an Edition's permanent key and never replaces them; a later write reuses the object only when its identity metadata matches. */
export async function putImmutableRulebookArtifact(
  bucket: RulebookArtifactBucket,
  artifactKind: RulebookEditionArtifactKind,
  job: AssignedRulebookArtifactJob,
  bytes: Uint8Array,
  rendererIdentity: string
): Promise<{ key: string; created: boolean }> {
  const storage = artifactStorage[artifactKind];
  const key = rulebookEditionArtifactKey(job.rulebookId, job.editionNumber, artifactKind);
  const customMetadata = {
    artifactId: job.artifactId,
    editionId: job.editionId,
    rulebookId: job.rulebookId,
    editionNumber: String(job.editionNumber),
    kind: artifactKind,
    ...storage.rendererMetadata(rendererIdentity),
    contentLength: String(bytes.byteLength),
    contentSha256: await contentSha256(bytes),
  };
  const written = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: storage.httpMetadata,
    customMetadata,
  });
  if (written) {
    return { key, created: true };
  }
  const existing = await bucket.head(key);
  if (!existing || !matchesJob(existing, customMetadata)) {
    throw new storage.GenerationError(
      `Permanent Rulebook ${artifactKind.toUpperCase()} path is occupied by different bytes`
    );
  }
  return { key, created: false };
}
