/**
 * The machine's originals store (`originalsStoreRoot`), which `media:sync` fills each worktree's media/ from, so a new worktree downloads nothing another one already has.
 * A worktree's file is a clone of the stored one where the disk supports it (APFS), so worktrees share the space but never each other's edits.
 * A stored file is written whole or not at all, and is hashed again before every use, so worktrees syncing at once cannot hand each other a broken original.
 */
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { download } from './media-originals';
import type { Original } from './media-originals';
import { originalsStoreRoot } from './media-store';

/** Puts the file in the store under the hash through a partial file and a rename, so a reader never sees half of it. */
function writeToStore(storeRoot: string, hash: string, write: (partial: string) => void): void {
  mkdirSync(storeRoot, { recursive: true });
  const partial = path.join(storeRoot, `${hash}.${process.pid}.partial`);
  write(partial);
  renameSync(partial, path.join(storeRoot, hash));
}

function intact(file: string, hash: string): boolean {
  return existsSync(file) && createHash('sha256').update(readFileSync(file)).digest('hex') === hash;
}

/** Copies a checked-out original the lock has already hashed into the store, when the store lacks it. */
export function seedStore(original: Original, file: string, storeRoot = originalsStoreRoot()): void {
  if (existsSync(file) && !existsSync(path.join(storeRoot, original.hash))) {
    writeToStore(storeRoot, original.hash, (partial) => copyFileSync(file, partial, constants.COPYFILE_FICLONE));
  }
}

/** Puts the original at each destination, which must not exist yet: cloned from the store when it holds the original intact, otherwise downloaded into the store first. */
export async function checkOutOriginal(
  original: Original,
  destinations: readonly string[],
  storeRoot = originalsStoreRoot()
): Promise<'cloned' | 'downloaded'> {
  const storedFile = path.join(storeRoot, original.hash);
  const cloned = intact(storedFile, original.hash);
  if (!cloned) {
    const bytes = await download(original);
    writeToStore(storeRoot, original.hash, (partial) => writeFileSync(partial, bytes));
  }
  for (const destination of destinations) {
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(storedFile, destination, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
  }
  return cloned ? 'cloned' : 'downloaded';
}
