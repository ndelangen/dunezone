/**
 * Generates every file under public/m/**, public/image/** and public/web/** from the raster lock and the sources in media/, per src/shared/assetRules.ts, sparing the committed files that `COMMITTED_WEB_FILES` names.
 *
 * Bun run generate:images [--prune]
 *
 * Per source `media/image/texture/021.jpg` this emits: public/image/texture/021-small.jpg (+ -large, and -print where declared) public/image/texture/021.jpg (safety-net re-encode at the canonical name, capped, same extension).
 * Each variant is first encoded into the content-addressed store `.cache/media/local/v/<src20>.<recipe10>.<ext>`, beside a `<name>.sha256` record of its SHA-256 and byte length (#1888 step 3).
 * The store is never wiped: a variant whose record still matches is reused, so only new originals or changed recipes are encoded.
 * public/ is then rebuilt from the store, so removals in media/ still propagate: each variant at its `/m/<name>`, which `resolveAsset` emits (#1888 step 5), and at its legacy path.
 * `--prune` deletes stored variants the current plan no longer names, so a store carried between CI runs stays the size of one store.
 * With MEDIA_FILL_ORIGIN set (CI sets https://dune.zone), a variant the store lacks is first downloaded from `/m`, where each deploy publishes them, and kept only when its bytes match the `X-Media-SHA256` and `X-Media-Bytes` it was served with.
 * Anything not published, or not verifiable, is encoded from the original as before, so the fill never decides correctness.
 * An original missing locally is downloaded from `/__media/src` at MEDIA_ORIGIN (https://dune.zone by default) and checked against the lock.
 * The runtime map of colours comes from the raster lock too (`bun run media:lock`), so nothing here is imported by the app.
 *
 * CI is the canonical producer (deployed bytes);
 * local runs feed dev/Storybook.
 * Renderer identity hashes this script + the rules + the locked source hashes + the sharp version, never encoder output (see workers/publisher/renderer-manifest-build.ts).
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

import { COMMITTED_WEB_FILES, ruleForKey } from '../src/shared/assetRules';
import type { RasterLock } from '../src/shared/media/rasterLock';
import { fetchMedia, integrityMatches } from './lib/media-fetch';
import { download } from './lib/media-originals';
import { sourcePath } from './lib/raster-lock';
import { checksumRecord, matchesRecord, planVariants } from './media-variants';
import type { ChecksumRecord, PlannedVariant } from './media-variants';
import { describeError } from './retry-transient';

const repoRoot = path.resolve(import.meta.dirname, '..');
const mediaRoot = path.join(repoRoot, 'media');
const publicRoot = path.join(repoRoot, 'public');
const storeRoot = path.join(repoRoot, '.cache/media/local/v');
const RASTER = /\.(png|jpe?g)$/i;
const prune = process.argv.includes('--prune');
const fillOrigin = process.env.MEDIA_FILL_ORIGIN?.replace(/\/$/, '');
const FILL_CONCURRENCY = 16;
const FILL_RETRY_DELAYS_MS = [1000, 2000, 4000];

const lock: RasterLock = JSON.parse(readFileSync(path.join(mediaRoot, 'raster.lock.json'), 'utf8'));

function walk(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

/** A local original the lock does not list would silently never render, so it stops the run instead. */
function assertLockCoversOriginals(): void {
  const unlocked = walk(mediaRoot)
    .filter((file) => RASTER.test(file))
    .map((file) => `/${path.relative(mediaRoot, file).split(path.sep).join('/')}`)
    .filter((key) => !lock[key]);
  if (unlocked.length > 0) {
    throw new Error(`Run \`bun run media:sync\`: the lock does not list ${unlocked.slice(0, 5).join(', ')}`);
  }
}

function storedBytes(variant: PlannedVariant): Uint8Array | null {
  const file = path.join(storeRoot, variant.name);
  if (!existsSync(file) || !existsSync(`${file}.sha256`)) {
    return null;
  }
  const record: ChecksumRecord = JSON.parse(readFileSync(`${file}.sha256`, 'utf8'));
  const bytes = readFileSync(file);
  return matchesRecord(bytes, record) ? bytes : null;
}

/**
 * Reads the original and refuses bytes that disagree with the lock, so a variant is never named after a hash it was not encoded from.
 * The originals are not in git (#1888 step 8): one missing locally is downloaded from ingest, verified and kept in media/, so the next run works offline.
 */
async function lockedOriginal(key: string): Promise<Buffer> {
  const file = sourcePath(key);
  if (!existsSync(file)) {
    const bytes = await download({ hash: lock[key].sha256, key, entry: lock[key] });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    return Buffer.from(bytes);
  }
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== lock[key].sha256) {
    throw new Error(`${key} hashes to ${sha256}, not the lock's ${lock[key].sha256}: run \`bun run media:sync\``);
  }
  return bytes;
}

async function encode(original: Buffer, variant: PlannedVariant, originalWidth: number): Promise<Buffer> {
  const { recipe } = variant;
  let pipeline = sharp(original);
  if (recipe.width && recipe.width < originalWidth) {
    pipeline = pipeline.resize(recipe.width, null, { kernel: recipe.kernel });
  }
  if (recipe.grayscale) {
    pipeline = pipeline.grayscale();
  }
  if (recipe.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: recipe.quality, progressive: recipe.progressive, mozjpeg: recipe.mozjpeg });
  } else if (recipe.format === 'webp') {
    pipeline = pipeline.webp({ quality: recipe.quality });
  } else {
    // palette quantization (libimagequant): 3-5x smaller PNGs; alpha preserved
    pipeline = pipeline.png({
      palette: recipe.palette,
      quality: recipe.quality,
      compressionLevel: recipe.compressionLevel ?? 9,
    });
  }
  return await pipeline.toBuffer();
}

/** Writes the variant, then its record, each through a rename, so an interrupted run leaves nothing that verifies. */
function store(variant: PlannedVariant, bytes: Buffer): void {
  const file = path.join(storeRoot, variant.name);
  writeFileSync(`${file}.tmp`, bytes);
  renameSync(`${file}.tmp`, file);
  writeFileSync(`${file}.sha256.tmp`, JSON.stringify(checksumRecord(bytes)));
  renameSync(`${file}.sha256.tmp`, `${file}.sha256`);
}

/** Stores the published variant and returns true, or returns false so the caller encodes it instead. */
async function fetchPublished(origin: string, variant: PlannedVariant): Promise<boolean> {
  try {
    const response = await fetchMedia(
      `${origin}/m/${variant.name}`,
      {},
      {
        subject: variant.name,
        delaysMs: FILL_RETRY_DELAYS_MS,
      }
    );
    const record = checksumRecord(response.bytes);
    if (response.status !== 200 || !integrityMatches(response.headers, record)) {
      return false;
    }
    store(variant, Buffer.from(response.bytes));
    return true;
  } catch (error) {
    console.error(`${variant.name}: not fetched, encoding instead (${describeError(error)})`);
    return false;
  }
}

/** Downloads every variant the store lacks that `/m` already serves, and returns how many it stored. */
async function fillFromPublished(plan: PlannedVariant[]): Promise<number> {
  if (!fillOrigin) {
    return 0;
  }
  const missing = [...new Map(plan.filter((variant) => !storedBytes(variant)).map((v) => [v.name, v])).values()];
  const results = await pool(missing, FILL_CONCURRENCY, (variant) => fetchPublished(fillOrigin, variant));
  return results.filter(Boolean).length;
}

/** Encodes whatever the store lacks for one original and returns how many variants that took. */
async function fillOriginal(key: string, variants: PlannedVariant[]): Promise<number> {
  const missing = variants.filter((variant) => !storedBytes(variant));
  if (missing.length === 0) {
    return 0;
  }
  const rule = ruleForKey(key);
  if (!rule?.transparent && !lock[key].isOpaque) {
    throw new Error(
      `${key} has genuine transparency but its category is declared opaque: ` +
        `move the file, fix the export, or change the declaration in assetRules.ts`
    );
  }
  const original = await lockedOriginal(key);
  for (const variant of missing) {
    store(variant, await encode(original, variant, lock[key].width));
  }
  return missing.length;
}

/** Runs `work` over every item with at most `limit` in flight. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  async function worker() {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await work(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Clears the generated trees, sparing the committed files under public/web. */
function clearGenerated(): void {
  rmSync(path.join(publicRoot, 'image'), { recursive: true, force: true });
  rmSync(path.join(publicRoot, 'm'), { recursive: true, force: true });
  const committedWebFiles = new Set<string>(COMMITTED_WEB_FILES);
  const generatedWeb = readdirSync(path.join(publicRoot, 'web')).filter((entry) => !committedWebFiles.has(entry));
  for (const entry of generatedWeb) {
    rmSync(path.join(publicRoot, 'web', entry), { recursive: true, force: true });
  }
}

/** Writes every variant at the legacy path that already-issued URLs still name, and each size tier at the `/m` name `resolveAsset` emits. */
function materialize(plan: PlannedVariant[]): void {
  clearGenerated();
  mkdirSync(path.join(publicRoot, 'm'));
  for (const variant of plan) {
    const target = path.join(publicRoot, variant.legacyPath);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(storeRoot, variant.name), target);
  }
  for (const variant of plan.filter(({ recipe }) => recipe.tier !== 'canonical')) {
    copyFileSync(path.join(storeRoot, variant.name), path.join(publicRoot, 'm', variant.name));
  }
}

const started = performance.now();
assertLockCoversOriginals();
const keys = Object.keys(lock).sort((left, right) => left.localeCompare(right));
const plans = new Map(keys.map((key) => [key, planVariants(key, lock[key], sharp.versions)]));
const plan = [...plans.values()].flat();
mkdirSync(storeRoot, { recursive: true });
const fetched = await fillFromPublished(plan);

function pruneStore(plan: PlannedVariant[]): number {
  const kept = new Set(plan.flatMap((variant) => [variant.name, `${variant.name}.sha256`]));
  const stale = readdirSync(storeRoot).filter((entry) => !kept.has(entry));
  for (const entry of stale) {
    rmSync(path.join(storeRoot, entry), { force: true });
  }
  return stale.length;
}

const encoded = await pool(keys, availableParallelism(), (key) => fillOriginal(key, plans.get(key)!));
materialize(plan);
const pruned = prune ? pruneStore(plan) : 0;

console.log(
  JSON.stringify({
    sources: keys.length,
    variants: plan.length,
    fetched,
    encoded: encoded.reduce((total, count) => total + count, 0),
    pruned,
    seconds: Math.round((performance.now() - started) / 100) / 10,
  })
);
