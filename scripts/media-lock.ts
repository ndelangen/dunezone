/**
 * Rewrites `src/shared/media/map.generated.ts` and `media/raster.lock.json` from the lock's own entries (#1888).
 *
 * Bun run media:lock
 *
 * Run it after the encoder or the asset rules change, which changes the recipe names in the map.
 * It refuses a new or changed original, because the originals live only in R2 (#1888 step 8): `bun run media:sync` uploads them and then writes the lock, so the lock never names an original R2 lacks.
 */
import { buildRasterLock, lockChanges, readRasterLock, writeRasterLock } from './lib/raster-lock';

const previous = readRasterLock();
const lock = await buildRasterLock(previous);
const { changed, removed } = lockChanges(previous, lock);
if (changed.length > 0) {
  console.error(
    `These originals are new or changed, so the lock was left as it was. Run \`bun run media:sync\` to upload them and write the lock:\n${changed
      .map((key) => `  ${key}`)
      .join('\n')}`
  );
  process.exit(1);
}
await writeRasterLock(lock);
console.log(JSON.stringify({ entries: Object.keys(lock).length, changed: changed.length, removed: removed.length }));
