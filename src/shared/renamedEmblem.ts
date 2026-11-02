/*
 * A faction's logo is being renamed to its emblem (the glossary term), in two releases.
 * The next release stores it under an `emblem` key and moves the stock artwork from `/vector/logo/` to `/vector/emblem/`.
 * Its Convex functions go live 15 to 40 minutes before its browser bundle and Workers do (see AGENTS.md on expand/contract),
 * so this release teaches the readers that lag behind to take the new names: the client boundary, the game Worker's catalogue reads and the capture page.
 * The next release removes this module.
 */

const RENAMED_PREFIX = '/vector/emblem/';
const CURRENT_PREFIX = '/vector/logo/';

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/**
 * A value from a newer release as this release reads it, at any depth: `emblem` keys become `logo`, `/vector/emblem/` paths become `/vector/logo/`.
 * A value that already has `logo` keeps it and loses the new key.
 * Nothing in this release's data is called `emblem`, so the rewrite cannot meet an unrelated key.
 */
export function readRenamedEmblems(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(readRenamedEmblems);
  }
  if (isRecord(input)) {
    const entries = Object.entries(input).filter(([key]) => key !== 'emblem' || !('logo' in input));
    return Object.fromEntries(
      entries.map(([key, value]) => [key === 'emblem' ? 'logo' : key, readRenamedEmblems(value)])
    );
  }
  return typeof input === 'string' && input.startsWith(RENAMED_PREFIX)
    ? CURRENT_PREFIX + input.slice(RENAMED_PREFIX.length)
    : input;
}
