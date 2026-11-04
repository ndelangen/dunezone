import { z } from 'zod';

/*
 * The glossary term is "Emblem" (see src/shared/glossary/terms.ts).
 * Until November 2026 the code called it a logo: factions stored it under a `logo` key, and the stock artwork lived under `/vector/logo/`.
 * The `emblem_rename_*` migrations (convex/emblemMigrations.ts) rewrite what Convex stores, but some copies cannot be rewritten:
 * game captures in Durable Object storage, published rulebook HTML, and content packages exported before the rename.
 * So every decoder of such a copy reads it through `renameLegacyEmblems`, at the root of what it stores (`legacyEmblemKeyed`), and `/vector/logo/` keeps being served.
 * The decoders inside stay exact: the rename is one walk at the root, the same one the migration runs, so the two cannot drift.
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

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/** An object's old `logo` key as `emblem`; a value that already has `emblem` only loses the old key. */
function readLegacyEmblemKey(input: unknown): unknown {
  if (!isRecord(input) || !('logo' in input)) {
    return input;
  }
  const { logo, ...rest } = input;
  return rest.emblem === undefined ? { ...rest, emblem: logo } : rest;
}

/** Wraps the decoder of a stored root so it also reads a copy written under the old names, at any depth. */
export function legacyEmblemKeyed<T extends z.ZodType>(schema: T) {
  return z.preprocess(renameLegacyEmblems, schema);
}

/*
 * Wrapping a schema that a Convex validator is derived from turns that validator into `v.any()` (convex-helpers has no preprocess branch),
 * so only stored roots are wrapped, never a wire answer.
 */

/**
 * Every old name in a stored JSON value as its new one, at any depth: `logo` keys become `emblem`, `/vector/logo/` paths become `/vector/emblem/`.
 * It is the migration's rewrite.
 * Nothing else in stored data is called `logo`: the Dune wordmark on a rulebook cover is `showDuneLogo`.
 * The walk goes by key name alone, so a future record keyed by typed text must never let a user name a key `logo`.
 */
export function renameLegacyEmblems(input: unknown): unknown {
  /* Almost every value read after the migration holds no old name, so the check, which allocates nothing, spares the copy. */
  return hasLegacyEmblems(input) ? renamed(input) : input;
}

function renamed(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(renamed);
  }
  if (isRecord(input)) {
    const record = readLegacyEmblemKey(input) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, renamed(value)]));
  }
  return readLegacyEmblemPath(input);
}

/** Whether a stored JSON value still holds an old name anywhere. */
export function hasLegacyEmblems(input: unknown): boolean {
  if (Array.isArray(input)) {
    return input.some(hasLegacyEmblems);
  }
  if (isRecord(input)) {
    return 'logo' in input || Object.values(input).some(hasLegacyEmblems);
  }
  return typeof input === 'string' && input.startsWith(LEGACY_EMBLEM_PREFIX);
}
