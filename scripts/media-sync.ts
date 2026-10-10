/**
 * Keeps `media/image/` and R2 in step with the raster lock, in one command (#1888 step 6).
 *
 * Bun run media:sync
 *
 * Pull: downloads every original the lock lists that is missing locally, verifying its SHA-256.
 * It never replaces a file that is already there, and needs no token.
 * Push: a file that is new or differs from the lock is uploaded through ingest with MEDIA_UPLOAD_TOKEN, and the lock and map are written only once every upload is confirmed, so the lock never names an original R2 lacks.
 * Before anything is uploaded, every new or changed file must be one the encoder accepts: under a category the rules cover, and opaque where its category is declared opaque.
 * Otherwise nothing is pushed and the lock is left as it was.
 * Without the token, sync lists what it would push and leaves the lock as it was.
 *
 * MEDIA_ORIGIN picks the Worker, https://dune.zone by default.
 * An original that cannot be fetched is listed, and the run carries on and fails at the end, so being offline only costs the art that is missing.
 * New art then still needs `bun run generate` for its collection membership (docs/technical/stock-artwork.md).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { distinctOriginals, download, eachWithCounts, mediaOrigin, upload } from './lib/media-originals';
import type { Original } from './lib/media-originals';
import { buildRasterLock, lockChanges, readRasterLock, sourcePath, writeRasterLock } from './lib/raster-lock';
import { assertEncodable } from './media-variants';

const token = process.env.MEDIA_UPLOAD_TOKEN;
const previous = readRasterLock();

/* Pull first, so the lock below is built over a complete tree and an absent file is never read as a removal. */
const missing = Object.keys(previous).filter((key) => !existsSync(sourcePath(key)));
async function pull(original: Original) {
  const bytes = await download(original);
  for (const key of missing.filter((candidate) => previous[candidate].sha256 === original.hash)) {
    mkdirSync(path.dirname(sourcePath(key)), { recursive: true });
    writeFileSync(sourcePath(key), bytes, { flag: 'wx' });
  }
  return 'pulled' as const;
}
const pulled = await eachWithCounts(distinctOriginals(previous, missing), pull);

const lock = await buildRasterLock(previous);
const { changed, removed } = lockChanges(previous, lock);
const pending = distinctOriginals(lock, changed);

/* A file the encoder would refuse is refused here, before it reaches R2 or the lock. */
const unencodable = changed.flatMap((key) => {
  try {
    assertEncodable(key, lock[key]);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
});
if (unencodable.length > 0) {
  console.error(
    `These originals cannot be encoded, so nothing was pushed and the lock is unchanged:\n${unencodable
      .map((problem) => `  ${problem}`)
      .join('\n')}`
  );
  process.exit(1);
}

async function push(original: Original) {
  return await upload(original, new Uint8Array(readFileSync(sourcePath(original.key))), token as string);
}

let pushed: Awaited<ReturnType<typeof eachWithCounts>> = {};
if (pending.length > 0 && !token) {
  console.error(
    `MEDIA_UPLOAD_TOKEN is not set, so these new or changed originals were not pushed and the lock is unchanged:\n${pending
      .map((original) => `  ${original.key}`)
      .join('\n')}`
  );
} else {
  pushed = await eachWithCounts(pending, push);
  /* A failed pull leaves the tree incomplete, so the lock is left as it was. */
  if (!pushed.failed && !pulled.failed) {
    await writeRasterLock(lock);
  }
}

console.log(
  JSON.stringify({
    origin: mediaOrigin,
    missing: missing.length,
    pull: pulled,
    changed: changed.length,
    removed: removed.length,
    push: pushed,
  })
);
if (pulled.failed || pushed.failed || (pending.length > 0 && !token)) {
  process.exit(1);
}
