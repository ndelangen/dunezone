/**
 * The merge gate for raster art (#1888 step 6): every original a pull request adds to the lock must already be in R2.
 *
 * Bun run media:gate
 *
 * It compares `media/raster.lock.json` at the merge base with `origin/main` with the working tree, downloads each new or changed original from `/__media/src/<sha256>`, and checks its bytes and integrity headers against the lock.
 * It needs no token, so it runs on fork pull requests too.
 * `bun run media:sync` is the fix for a failure: it uploads the original before it writes the lock.
 */
import { execFileSync } from 'node:child_process';

import type { RasterLock } from '../src/shared/media/rasterLock';
import { distinctOriginals, download, eachWithCounts, mediaOrigin } from './lib/media-originals';
import type { Original } from './lib/media-originals';
import { lockChanges, readRasterLock } from './lib/raster-lock';

/* The merge base with origin/main, so originals main gained since the branch point are not counted as this branch's; fixed arguments keep caller input off the git command line. */
const BASE = execFileSync('/usr/bin/git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();

const baseLock = JSON.parse(
  execFileSync('/usr/bin/git', ['show', `${BASE}:media/raster.lock.json`], { encoding: 'utf8' })
) as RasterLock;
const lock = readRasterLock();
const { changed } = lockChanges(baseLock, lock);
const known = new Set(Object.values(baseLock).map((entry) => entry.sha256));
/* An original the base already lists passed this gate when it was added. */
const added = distinctOriginals(lock, changed).filter((original) => !known.has(original.hash));

async function ingested(original: Original) {
  await download(original);
  return 'ingested' as const;
}
const counts = await eachWithCounts(added, ingested);

console.log(
  JSON.stringify({ origin: mediaOrigin, base: BASE, changedKeys: changed.length, originals: added.length, ...counts })
);
if (counts.failed) {
  console.error(
    'Art changes run on a maintainer machine, which holds MEDIA_UPLOAD_TOKEN: run `bun run media:sync` there to upload these originals, then commit the lock it writes. A cloud agent hands the branch to that local run instead.'
  );
  process.exit(1);
}
