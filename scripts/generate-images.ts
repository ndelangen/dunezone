/**
 * Generates every file under public/image/** and public/web/** from the raster lock and the sources in media/, per src/shared/assetRules.ts, sparing the committed files that `COMMITTED_WEB_FILES` names.
 *
 * Bun run generate:images [--cached-only] [--prune]
 *
 * Per source `media/image/texture/021.jpg` this emits: public/image/texture/021-small.jpg (+ -large, and -print where declared) public/image/texture/021.jpg (safety-net re-encode at the canonical name, capped, same extension).
 * Each variant is first encoded into the content-addressed store `.cache/media/local/v/<src20>.<recipe10>.<ext>`, beside a `<name>.sha256` record of its SHA-256 and byte length (#1888 step 3).
 * The store is never wiped: a variant whose record still matches is reused, so only new originals or changed recipes are encoded.
 * public/ is then rebuilt from the store, so removals in media/ still propagate.
 * `--cached-only` encodes nothing and exits 3 when a variant is missing, so CI can tell whether it needs the original bytes at all.
 * `--prune` deletes stored variants the current plan no longer names, so a store carried between CI runs stays the size of one store.
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
import { checksumRecord, matchesRecord, planVariants } from './media-variants';
import type { ChecksumRecord, PlannedVariant } from './media-variants';

const repoRoot = path.resolve(import.meta.dirname, '..');
const mediaRoot = path.join(repoRoot, 'media');
const publicRoot = path.join(repoRoot, 'public');
const storeRoot = path.join(repoRoot, '.cache/media/local/v');
const RASTER = /\.(png|jpe?g)$/i;
const cachedOnly = process.argv.includes('--cached-only');
const prune = process.argv.includes('--prune');

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
    throw new Error(`Run \`bun run media:lock\`: the lock does not list ${unlocked.slice(0, 5).join(', ')}`);
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

/** Reads the original and refuses bytes that disagree with the lock, so a variant is never named after a hash it was not encoded from. */
function lockedOriginal(key: string): Buffer {
  const file = path.join(mediaRoot, key.replace(/^\//, ''));
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== lock[key].sha256) {
    throw new Error(`${key} hashes to ${sha256}, not the lock's ${lock[key].sha256}: run \`bun run media:lock\``);
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
  const original = lockedOriginal(key);
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

function materialize(plan: PlannedVariant[]): void {
  rmSync(path.join(publicRoot, 'image'), { recursive: true, force: true });
  const committedWebFiles = new Set<string>(COMMITTED_WEB_FILES);
  for (const entry of readdirSync(path.join(publicRoot, 'web'))) {
    if (!committedWebFiles.has(entry)) {
      rmSync(path.join(publicRoot, 'web', entry), { recursive: true, force: true });
    }
  }
  for (const variant of plan) {
    const target = path.join(publicRoot, variant.legacyPath);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(storeRoot, variant.name), target);
  }
}

const started = performance.now();
assertLockCoversOriginals();
const keys = Object.keys(lock).sort();
const plans = new Map(keys.map((key) => [key, planVariants(key, lock[key], sharp.versions)]));
const plan = [...plans.values()].flat();
mkdirSync(storeRoot, { recursive: true });

if (cachedOnly) {
  const missing = plan.filter((variant) => !storedBytes(variant)).length;
  if (missing > 0) {
    console.log(JSON.stringify({ variants: plan.length, missing }));
    process.exit(3);
  }
}

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
    encoded: encoded.reduce((total, count) => total + count, 0),
    pruned,
    seconds: Math.round((performance.now() - started) / 100) / 10,
  })
);
