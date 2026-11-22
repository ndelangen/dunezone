/*
 * The glossary term is "Emblem" (see src/shared/glossary/terms.ts).
 * Until November 2026 the code called it a logo: factions stored it under a `logo` key, and the stock artwork lived under `/vector/logo/`.
 * Migrations rewrote everything Convex stores (production finished them on 3 to 4 November 2026), and every decoder takes the new names only:
 * Convex rows, capture jobs, game captures (games started before 4 November 2026 may stop opening) and imported files.
 * Published rulebook HTML cannot be rewritten, so the publisher keeps serving `/vector/logo/` from the renamed files; this module names that path.
 */

/** Where the stock emblems lived before the rename. */
export const LEGACY_EMBLEM_PREFIX = '/vector/logo/';
/** Where the stock emblems live now. */
const EMBLEM_PREFIX = '/vector/emblem/';

/** A stock emblem's old path as its new one; any other value is returned as it is. */
export function readLegacyEmblemPath(input: unknown): unknown {
  return typeof input === 'string' && input.startsWith(LEGACY_EMBLEM_PREFIX)
    ? EMBLEM_PREFIX + input.slice(LEGACY_EMBLEM_PREFIX.length)
    : input;
}
