import { z } from 'zod';

/** The artifact kinds one Edition reserves, in the order the editor and the seam both report them. */
export const RULEBOOK_EDITION_ARTIFACT_KINDS = ['html', 'pdf'] as const;

const rulebookEditionArtifactKindSchema = z.enum(RULEBOOK_EDITION_ARTIFACT_KINDS);

export type RulebookEditionArtifactKind = z.infer<typeof rulebookEditionArtifactKindSchema>;

function assertEditionNumber(editionNumber: number) {
  if (!Number.isSafeInteger(editionNumber) || editionNumber < 1) {
    throw new Error('Rulebook Edition number must be a positive integer');
  }
}

function assertRulebookId(rulebookId: string) {
  if (!rulebookId) {
    throw new Error('Rulebook id is invalid for a published path');
  }
  if (rulebookId.includes('/')) {
    throw new Error('Rulebook id is invalid for a published path');
  }
  if (rulebookId.includes('..')) {
    throw new Error('Rulebook id is invalid for a published path');
  }
}

/**
 * The permanent public path reserved for one Edition artifact before its bytes are ready.
 *
 * These paths sit under `/published/` but deliberately do not go through `PUBLICATION_TARGETS`.
 * That registry serves one file per collection under a cache token that changes on every publish, which is the opposite of what «Define the Rulebook publication lifecycle» accepted for Editions: a permanent URL that a rename never moves, `X-Robots-Tag: noindex` on every Edition-specific response, and one canonical latest-ready pointer beside them.
 *
 * The consequence is a handover, not a free choice.
 * `handlePublicAssetRequest` runs first in the publisher Worker and claims the whole `/published/` namespace, returning 404 for every path `matchPublishedPath` does not recognize, and it cannot recognize these.
 * So the Edition delivery route in #913 and #914 has to extend that handler before any of these reserved paths can serve bytes.
 * Until it does, a reserved path is a 404 by construction rather than by accident, which is why nothing links to one yet.
 */
export function rulebookEditionArtifactPath(
  rulebookId: string,
  editionNumber: number,
  kind: RulebookEditionArtifactKind
) {
  assertRulebookId(rulebookId);
  assertEditionNumber(editionNumber);
  const file = kind === 'html' ? 'rulebook.html' : 'rulebook.pdf';
  return `/published/rulebooks/${encodeURIComponent(rulebookId)}/editions/${editionNumber}/${file}`;
}
