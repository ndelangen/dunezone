/**
 * Structural verification of generated image output (wayfinder #269): checks that public/image/** and public/web/** are complete and well-formed relative to media/ and the rules table, WITHOUT re-encoding anything (encoder bytes are not comparable across machines;
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
 * Every /image/, /web/, /font/ and /dice.svg URL referenced from src CSS, TS or TSX resolves to a file.
 * The Storybook build silences Vite's warning about these, so this is what keeps them honest.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { COMMITTED_WEB_FILES, FORMAT_EXTENSION, ruleForKey } from '../src/shared/assetRules';

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

/* The same list the generator spares, so the two cannot drift apart again (`COMMITTED_WEB_FILES` in assetRules.ts says what happened when they did). */
const committedWebPaths = new Set(COMMITTED_WEB_FILES.map((name) => `web/${name}`));

/*
 * Each committed file has to BE there, checked head-on rather than inferred.
 * The orphan walk below only visits files that exist, so a deleted one is silently not-an-orphan, and the reference scan further down catches it only while some `src/` file happens to name it in a string literal.
 * `no-deck-back.svg` was caught that way and a committed file nobody references by literal would not be (CodeRabbit, PR #614).
 */
for (const name of COMMITTED_WEB_FILES) {
  if (!existsSync(path.join(publicRoot, 'web', name))) {
    failures.push(`committed web file missing: web/${name} (generate:images must spare it, see COMMITTED_WEB_FILES)`);
  }
}

for (const generated of [...walk(path.join(publicRoot, 'image')), ...walk(path.join(publicRoot, 'web'))]) {
  const relative = path.relative(publicRoot, generated).split(path.sep).join('/');
  if (committedWebPaths.has(relative)) {
    continue;
  }
  if (!expectedFiles.has(relative)) {
    failures.push(`orphan generated file: ${relative}`);
  }
}

/*
 * Root-absolute asset references (decision #254: hardcoded variant URLs guarded by CI).
 * Storybook builds with `publicDir: false` and only mounts `public/` in DEVELOPMENT (`.storybook/main.ts`), so Vite cannot resolve these at build time and says so once per asset.
 * That message is filtered out of the Storybook build log, which is only honest while something else proves the files are there.
 * This is that something else, so the two must stay in step: every prefix the filter silences has to be a prefix this check walks.
 */
const REFERENCE_PREFIXES = ['image', 'web', 'font'] as const;
const prefixGroup = REFERENCE_PREFIXES.join('|');
/* `url("/font/x.woff2")` in a stylesheet. */
const cssUrlPattern = new RegExp(`url\\(["']?(/(?:${prefixGroup})/[^"')]+|/dice\\.svg)["']?\\)`, 'g');
/* `href: '/font/x.woff2'` in a preload list, and any other quoted literal naming a file. */
const literalPattern = new RegExp(`['"](/(?:${prefixGroup})/[A-Za-z0-9._/-]+\\.[a-z0-9]+|/dice\\.svg)['"]`, 'g');

const referencingFiles = walk(path.join(repoRoot, 'src')).filter(
  (file) => file.endsWith('.css') || file.endsWith('.ts') || file.endsWith('.tsx')
);
for (const referencingFile of referencingFiles) {
  const contents = await Bun.file(referencingFile).text();
  const pattern = referencingFile.endsWith('.css') ? cssUrlPattern : literalPattern;
  for (const match of contents.matchAll(pattern)) {
    const referenced = match[1] as string;
    if (!existsSync(path.join(publicRoot, referenced.replace(/^\//, '')))) {
      failures.push(`${path.relative(repoRoot, referencingFile)}: references ${referenced} which does not exist`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.slice(0, 40).join('\n'));
  console.error(`\n${failures.length} image verification failure(s)`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, sources: sources.length, generatedFiles: expectedFiles.size }));
