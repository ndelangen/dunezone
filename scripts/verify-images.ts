/**
 * Structural verification of generated image output (wayfinder #269): checks that public/image/** and public/web/** are complete and well-formed relative to media/ and the rules table — WITHOUT re-encoding anything (encoder bytes are not comparable across machines;
 * identity is ingredient-hashed).
 *
 * Bun run verify:images
 *
 * Verifies:
 *
 * 1.
 * Every media source has all declared size tiers + the safety-net file
 * 2.
 * Tier files decode, have the declared format, and respect declared widths
 * 3.
 * No orphan files in the generated tree (removals propagate)
 * 4.
 * Every /image/ and /web/ URL referenced from src CSS resolves to a file
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { FORMAT_EXTENSION, ruleForKey } from '../src/shared/assetRules';

const repoRoot = path.resolve(import.meta.dirname, '..');
const mediaRoot = path.join(repoRoot, 'media');
const publicRoot = path.join(repoRoot, 'public');
const RASTER = /\.(png|jpe?g)$/i;

function walk(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const failures: string[] = [];
const expectedFiles = new Set<string>();

const sources = walk(mediaRoot).filter((file) => RASTER.test(file));
for (const source of sources) {
  const relative = path.relative(mediaRoot, source).split(path.sep).join('/');
  const key = `/${relative}`;
  const rule = ruleForKey(key);
  if (!rule) {
    failures.push(`${key}: no asset rule covers this source`);
    continue;
  }
  const directory = path.dirname(relative);
  const baseName = path.basename(relative).replace(RASTER, '');
  const extension = FORMAT_EXTENSION[rule.format];

  const sourceWidth = (await sharp(source).metadata()).width ?? 0;

  for (const [sizeName, sizeWidth] of Object.entries(rule.sizes)) {
    if (sizeWidth === undefined) {
      continue;
    }
    const tierRelative = `${directory}/${baseName}-${sizeName}.${extension}`;
    const tierAbsolute = path.join(publicRoot, tierRelative);
    expectedFiles.add(tierRelative);
    if (!existsSync(tierAbsolute)) {
      failures.push(`${key}: missing tier ${tierRelative}`);
      continue;
    }
    const metadata = await sharp(tierAbsolute)
      .metadata()
      .catch(() => null);
    if (!metadata?.width) {
      failures.push(`${key}: tier ${tierRelative} does not decode`);
      continue;
    }
    const declaredFormat = rule.format === 'jpeg' ? 'jpeg' : rule.format;
    if (metadata.format !== declaredFormat) {
      failures.push(`${key}: tier ${tierRelative} is ${metadata.format}, expected ${declaredFormat}`);
    }
    const expectedWidth = sizeWidth === null ? sourceWidth : Math.min(sizeWidth, sourceWidth);
    if (metadata.width !== expectedWidth) {
      failures.push(`${key}: tier ${tierRelative} width ${metadata.width}, expected ${expectedWidth}`);
    }
  }

  expectedFiles.add(relative);
  const safetyAbsolute = path.join(publicRoot, relative);
  if (!existsSync(safetyAbsolute)) {
    failures.push(`${key}: missing safety-net file at canonical name`);
  } else {
    const metadata = await sharp(safetyAbsolute)
      .metadata()
      .catch(() => null);
    if (!metadata?.width) {
      failures.push(`${key}: safety-net file does not decode`);
    } else if (metadata.width > rule.safetyCapPx) {
      failures.push(`${key}: safety-net width ${metadata.width} exceeds cap ${rule.safetyCapPx}`);
    }
  }
}

for (const generated of [...walk(path.join(publicRoot, 'image')), ...walk(path.join(publicRoot, 'web'))]) {
  const relative = path.relative(publicRoot, generated).split(path.sep).join('/');
  if (relative === 'web/logo.svg') {
    continue; // committed, not generated
  }
  if (!expectedFiles.has(relative)) {
    failures.push(`orphan generated file: ${relative}`);
  }
}

// CSS references (decision #254: hardcoded variant URLs guarded by CI).
const cssFiles = walk(path.join(repoRoot, 'src')).filter((file) => file.endsWith('.css'));
const urlPattern = /url\(["']?(\/(?:image|web)\/[^"')]+)["']?\)/g;
for (const cssFile of cssFiles) {
  const contents = await Bun.file(cssFile).text();
  for (const match of contents.matchAll(urlPattern)) {
    const referenced = match[1] as string;
    if (!existsSync(path.join(publicRoot, referenced.replace(/^\//, '')))) {
      failures.push(`${path.relative(repoRoot, cssFile)}: references ${referenced} which does not exist`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.slice(0, 40).join('\n'));
  console.error(`\n${failures.length} image verification failure(s)`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, sources: sources.length, generatedFiles: expectedFiles.size }));
