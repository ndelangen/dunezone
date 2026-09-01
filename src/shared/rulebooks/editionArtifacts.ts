import { z } from 'zod';

export const rulebookEditionArtifactKindSchema = z.enum(['html', 'pdf']);
export const rulebookEditionArtifactStatusSchema = z.enum(['preparing', 'ready', 'failed']);

export type RulebookEditionArtifactKind = z.infer<typeof rulebookEditionArtifactKindSchema>;
export type RulebookEditionArtifactStatus = z.infer<typeof rulebookEditionArtifactStatusSchema>;

function assertEditionNumber(editionNumber: number) {
  if (!Number.isSafeInteger(editionNumber) || editionNumber < 1) {
    throw new Error('Rulebook Edition number must be a positive integer');
  }
}

function assertRulebookId(rulebookId: string) {
  if (!rulebookId || rulebookId.includes('/') || rulebookId.includes('..')) {
    throw new Error('Rulebook id is invalid for a published path');
  }
}

/** The permanent public path reserved for one Edition artifact before its bytes are ready. */
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
