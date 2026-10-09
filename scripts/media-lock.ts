/**
 * Writes `media/raster.lock.json` and `src/shared/media/map.generated.ts` from the raster originals under media/ (#1888).
 *
 * Bun run media:lock
 *
 * Run it after adding or changing a raster source.
 * It writes the lock without uploading, while `bun run media:sync` uploads new originals and then writes the lock.
 */
import { buildRasterLock, lockChanges, readRasterLock, writeRasterLock } from './lib/raster-lock';

const previous = readRasterLock();
const lock = await buildRasterLock(previous);
await writeRasterLock(lock);

const { changed, removed } = lockChanges(previous, lock);
console.log(JSON.stringify({ entries: Object.keys(lock).length, changed: changed.length, removed: removed.length }));
