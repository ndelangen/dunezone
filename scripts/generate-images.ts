/**
 * Generates every file under public/image/** and public/web/** from the sources in media/, per src/shared/assetRules.ts, sparing the committed files that `COMMITTED_WEB_FILES` names.
 *
 * Bun run generate:images
 *
 * Per source `media/image/texture/021.jpg` this emits: public/image/texture/021-small.jpg (+ -large, and -print where declared) public/image/texture/021.jpg (safety-net re-encode at the canonical name, capped, same extension).
 * The runtime map of colours comes from the raster lock instead (`bun run media:lock`, #1888), so nothing here is imported by the app.
 *
 * CI is the canonical producer (deployed bytes);
 * local runs feed dev/Storybook.
 * Renderer identity hashes this script + the rules + the locked source hashes + the sharp version, never encoder output (see workers/publisher/renderer-manifest-build.ts).
 */
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { ASSET_RULES, COMMITTED_WEB_FILES, FORMAT_EXTENSION, ruleForKey } from '../src/shared/assetRules';

const repoRoot = path.resolve(import.meta.dirname, '..');
const mediaRoot = path.join(repoRoot, 'media');
const publicRoot = path.join(repoRoot, 'public');
const RASTER = /\.(png|jpe?g)$/i;

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

async function generateOne(sourceAbsolute: string): Promise<void> {
  const relative = path.relative(mediaRoot, sourceAbsolute).split(path.sep).join('/');
  const key = `/${relative}`;
  const rule = ruleForKey(key);
  if (!rule) {
    throw new Error(`No asset rule covers ${key}`);
  }

  const source = sharp(sourceAbsolute);
  const [metadata, stats] = await Promise.all([source.metadata(), source.stats()]);
  const width = metadata.width ?? 0;
  if (!width) {
    throw new Error(`Cannot read dimensions of ${key}`);
  }

  if (!rule.transparent && !stats.isOpaque) {
    throw new Error(
      `${key} has genuine transparency but its category is declared opaque: ` +
        `move the file, fix the export, or change the declaration in assetRules.ts`
    );
  }

  const outDirectory = path.join(publicRoot, path.dirname(relative));
  mkdirSync(outDirectory, { recursive: true });
  const baseName = path.basename(relative).replace(RASTER, '');
  const canonicalExtension = path.extname(relative).slice(1).toLowerCase();

  async function encode(targetWidth: number | null, outPath: string, format: string) {
    let pipeline = sharp(sourceAbsolute);
    if (targetWidth && targetWidth < width) {
      pipeline = pipeline.resize(targetWidth);
    }
    if (rule!.grayscale) {
      pipeline = pipeline.grayscale();
    }
    if (format === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: rule!.quality, progressive: true, mozjpeg: true });
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality: rule!.quality });
    } else {
      // palette quantization (libimagequant): 3-5x smaller PNGs; alpha preserved
      pipeline = pipeline.png({ palette: true, quality: rule!.quality, compressionLevel: 9 });
    }
    await pipeline.toFile(outPath);
  }

  const extension = FORMAT_EXTENSION[rule.format];
  for (const [sizeName, sizeWidth] of Object.entries(rule.sizes)) {
    if (sizeWidth === undefined) {
      continue;
    }
    await encode(sizeWidth, path.join(outDirectory, `${baseName}-${sizeName}.${extension}`), rule.format);
  }

  /**
   * Safety net at the canonical name: same extension as the key so any unresolved reference (including the publisher capture, where a 404 is fatal) keeps rendering.
   * Never upscaled, capped per rule.
   */
  const safetyFormat = canonicalExtension === 'png' ? 'png' : canonicalExtension === 'webp' ? 'webp' : 'jpeg';
  await encode(rule.safetyCapPx, path.join(outDirectory, path.basename(relative)), safetyFormat);
}

// Reset output directories so removals in media/ propagate.
rmSync(path.join(publicRoot, 'image'), { recursive: true, force: true });
const committedWebFiles = new Set<string>(COMMITTED_WEB_FILES);
for (const entry of readdirSync(path.join(publicRoot, 'web'))) {
  if (!committedWebFiles.has(entry)) {
    rmSync(path.join(publicRoot, 'web', entry), { recursive: true, force: true });
  }
}

const sources = walk(mediaRoot).filter((file) => RASTER.test(file));
const unknown = sources.filter((file) => !ruleForKey(`/${path.relative(mediaRoot, file).split(path.sep).join('/')}`));
if (unknown.length > 0) {
  throw new Error(`No asset rule covers: ${unknown.slice(0, 5).join(', ')}`);
}

const started = performance.now();
const CONCURRENCY = 8;
for (let index = 0; index < sources.length; index += CONCURRENCY) {
  const batch = sources.slice(index, index + CONCURRENCY);
  await Promise.all(batch.map(generateOne));
}

const categories = Object.keys(ASSET_RULES).length;
console.log(
  JSON.stringify({
    sources: sources.length,
    categories,
    seconds: Math.round((performance.now() - started) / 100) / 10,
  })
);
