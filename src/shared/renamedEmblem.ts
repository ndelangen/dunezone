/*
 * A faction's logo is being renamed to its emblem (the glossary term), in two releases.
 * The next release stores it under an `emblem` key and moves the stock artwork from `/vector/logo/` to `/vector/emblem/`.
 * Its Convex functions go live 15 to 40 minutes before its browser bundle and Workers do (see AGENTS.md on expand/contract),
 * so this release teaches the readers that lag behind to take the new names: the client boundary, the game Worker's catalogue reads and the capture page.
 * The next release removes this module.
 */

const RENAMED_PREFIX = '/vector/emblem/';
const CURRENT_PREFIX = '/vector/logo/';

/** Only plain objects are rebuilt: bytes, dates, files and other class instances pass through as they are. */
function isPlainRecord(input: unknown): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

/**
 * A value from a newer release as this release reads it, at any depth: `emblem` keys become `logo`, `/vector/emblem/` paths become `/vector/logo/`.
 * A value that already has `logo` keeps it and loses the new key.
 * Nothing in this release's data is called `emblem`, so the rewrite cannot meet an unrelated key.
 * Whatever needs no rename comes back as the same reference, so today's data passes through without a copy.
 */
export function readRenamedEmblems(input: unknown): unknown {
  if (Array.isArray(input)) {
    const read = input.map(readRenamedEmblems);
    return read.some((value, index) => value !== input[index]) ? read : input;
  }
  if (isPlainRecord(input)) {
    let changed = false;
    const entries: [string, unknown][] = [];
    for (const [key, value] of Object.entries(input)) {
      if (key === 'emblem') {
        changed = true;
        if ('logo' in input) {
          continue;
        }
      }
      const read = readRenamedEmblems(value);
      changed ||= read !== value;
      entries.push([key === 'emblem' ? 'logo' : key, read]);
    }
    return changed ? Object.fromEntries(entries) : input;
  }
  return typeof input === 'string' && input.startsWith(RENAMED_PREFIX)
    ? CURRENT_PREFIX + input.slice(RENAMED_PREFIX.length)
    : input;
}
