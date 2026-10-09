/**
 * Copies every raster original the lock lists into R2 through the publisher's ingest, and proves the copy (#1888 step 0).
 *
 * `MEDIA_UPLOAD_TOKEN=… bun run media:backfill` uploads what R2 lacks.
 * An original already there is checked, not sent again.
 * `bun run media:backfill --verify` downloads every original back and compares it with the lock.
 * It needs no token.
 *
 * MEDIA_ORIGIN picks the Worker, https://dune.zone by default.
 * The bytes come from the git checkout and must match the lock first, so a stale lock stops the run before anything is sent.
 * 429, 5xx and connection errors are retried as transport, not as findings.
 * Any other refusal fails that original and the run.
 */
import { readFileSync } from 'node:fs';

import { distinctOriginals, download, eachWithCounts, mediaOrigin, upload } from './lib/media-originals';
import type { Original } from './lib/media-originals';
import { readRasterLock, sourcePath } from './lib/raster-lock';

const verifyOnly = process.argv.includes('--verify');
const token = process.env.MEDIA_UPLOAD_TOKEN;

if (!verifyOnly && !token) {
  console.error('MEDIA_UPLOAD_TOKEN is not set; pass --verify to check without uploading.');
  process.exit(1);
}

const originals = distinctOriginals(readRasterLock());

async function backfill(original: Original) {
  return await upload(original, new Uint8Array(readFileSync(sourcePath(original.key))), token as string);
}

async function verify(original: Original) {
  await download(original);
  return 'verified' as const;
}

const counts = await eachWithCounts<Original, string>(originals, verifyOnly ? verify : backfill);

console.log(
  JSON.stringify({
    origin: mediaOrigin,
    mode: verifyOnly ? 'verify' : 'backfill',
    originals: originals.length,
    ...counts,
  })
);
if (counts.failed) {
  process.exit(1);
}
