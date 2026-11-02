import { z } from 'zod';

/*
 * The glossary term is "Emblem" (see src/shared/glossary/terms.ts).
 * Until November 2026 the code called it a logo: factions stored it under a `logo` key, and the stock artwork lived under `/vector/logo/`.
 * `emblem_rename_v1` rewrites what Convex stores, but some copies cannot be rewritten:
 * game captures and snapshots in Durable Object storage, published rulebook HTML, and content packages exported before the rename.
 * So every decoder that can meet one keeps reading the old names through the two helpers below, and `/vector/logo/` keeps being served.
 */

/** Where the stock emblems lived before the rename. */
export const LEGACY_EMBLEM_PREFIX = '/vector/logo/';
/** Where the stock emblems live now. */
export const EMBLEM_PREFIX = '/vector/emblem/';

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
export function readLegacyEmblemKey(input: unknown): unknown {
  if (!isRecord(input) || !('logo' in input)) {
    return input;
  }
  const { logo, ...rest } = input;
  return rest.emblem === undefined ? { ...rest, emblem: logo } : rest;
}

/** Wraps a decoder of an object with an `emblem` key so it also reads one stored under `logo`. */
export function legacyEmblemKeyed<T extends z.ZodType>(schema: T) {
  return z.preprocess(readLegacyEmblemKey, schema);
}

/**
 * Every old name in a stored JSON value as its new one, at any depth: `logo` keys become `emblem`, `/vector/logo/` paths become `/vector/emblem/`.
 * It is the migration's rewrite.
 * Nothing else in stored data is called `logo`: the Dune wordmark on a rulebook cover is `showDuneLogo`.
 */
export function renameLegacyEmblems(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(renameLegacyEmblems);
  }
  if (isRecord(input)) {
    const renamed = readLegacyEmblemKey(input) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(renamed).map(([key, value]) => [key, renameLegacyEmblems(value)]));
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
