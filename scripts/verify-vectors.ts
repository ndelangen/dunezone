/**
 * Structural verification of generated vector output (wayfinder #296 guards, train ticket #306): checks public/vector/** against media/vector/** and the rules — without re-optimizing anything.
 *
 * Bun run verify:vectors
 *
 * Guards (#296, plus the authoring stamp from #298):
 *
 * 1.
 * Every generated file resolves `#root` and has `overflow="visible"` on its root
 * 2.
 * Every generated file's viewBox is exactly `0 0 100 100`
 * 3.
 * Paint-inheriting categories carry no baked paint
 * 4.
 * Baked paint elsewhere only where the rules allow it (`-multicolor` naming for decals)
 * 5.
 * The map's enumerated place-ids all survive optimization
 * 6.
 * No orphans: every generated file traces to a media source, and every source generated
 * 7.
 * Media sources carry the authoring stamp (hard failure;
 * the in-repo tool emits it)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  allowsBakedPaint,
  MAP_PLACE_IDS,
  VECTOR_AUTHORED_ATTRIBUTE,
  VECTOR_CATEGORY_RULES,
  VECTOR_VIEWBOX_SIZE,
} from '../src/shared/vectorRules';
import type { VectorCategory } from '../src/shared/vectorRules';

const repoRoot = path.resolve(import.meta.dirname, '..');
const mediaRoot = path.join(repoRoot, 'media/vector');
const publicRoot = path.join(repoRoot, 'public/vector');

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

const PAINT_ATTRIBUTE = /\s(?:fill|stroke)="(?!none")/;
const PAINT_STYLE = /\sstyle="[^"]*(?:fill|stroke)\s*:\s*(?!none)/;

/** True when the stamp is an attribute of the opening root `<svg …>` tag itself. */
function rootTagCarriesStamp(svg: string): boolean {
  const rootTag = svg.match(/<svg\b[^>]*>/);
  return rootTag !== null && rootTag[0].includes(`${VECTOR_AUTHORED_ATTRIBUTE}="`);
}

const sources = walk(mediaRoot).filter((file) => file.endsWith('.svg'));
const sourceRelatives = new Set(sources.map((file) => path.relative(mediaRoot, file).split(path.sep).join('/')));

for (const relative of sourceRelatives) {
  const category = relative.split('/')[0] as VectorCategory;
  if (!(category in VECTOR_CATEGORY_RULES)) {
    failures.push(`${relative}: unknown vector category`);
    continue;
  }
  const generatedPath = path.join(publicRoot, relative);
  if (!existsSync(generatedPath)) {
    failures.push(`${relative}: missing generated file`);
    continue;
  }
  const generated = readFileSync(generatedPath, 'utf8');
  const fileName = path.basename(relative);

  // 1. #root + overflow
  if (!generated.includes('id="root"')) {
    failures.push(`${relative}: generated file does not resolve #root`);
  }
  if (!/<svg[^>]*\soverflow="visible"/.test(generated)) {
    failures.push(`${relative}: root is missing overflow="visible"`);
  }

  // 2. the shared box
  const box = `0 0 ${VECTOR_VIEWBOX_SIZE} ${VECTOR_VIEWBOX_SIZE}`;
  if (!generated.includes(`viewBox="${box}"`)) {
    failures.push(`${relative}: viewBox is not "${box}"`);
  }

  // 3 + 4. paint policy
  const carriesPaint = PAINT_ATTRIBUTE.test(generated) || PAINT_STYLE.test(generated);
  if (carriesPaint && !allowsBakedPaint(category, fileName)) {
    failures.push(`${relative}: carries baked paint but its category inherits paint`);
  }

  /*
   * 7. authoring stamp (#298; hard since #311 — the in-repo tool emits it, legacy sources are
   * batch-stamped, so a missing stamp means the file never went through the authoring pipeline).
   * Checked as an attribute of the root <svg> tag, not as a substring: a mention in a comment or
   * text node must not satisfy the gate.
   */
  const source = readFileSync(path.join(mediaRoot, relative), 'utf8');
  if (!rootTagCarriesStamp(source)) {
    failures.push(
      `${relative}: root <svg> has no ${VECTOR_AUTHORED_ATTRIBUTE} stamp — run it through the authoring tool`
    );
  }
  if (rootTagCarriesStamp(generated)) {
    failures.push(`${relative}: authoring stamp leaked into generated output`);
  }
}

// 5. the map's place-id API
const mapPath = path.join(publicRoot, 'background/map.svg');
if (existsSync(mapPath)) {
  const map = readFileSync(mapPath, 'utf8');
  for (const placeId of MAP_PLACE_IDS) {
    if (!map.includes(`id="${placeId}"`)) {
      failures.push(`background/map.svg: place-id #${placeId} was dropped by optimization`);
    }
  }
} else {
  /*
   * Consumers hard-reference the map's fragment API; its absence is a failure even if the media
   * source vanished too (the per-source check only fires while a source exists).
   */
  failures.push('background/map.svg: missing generated map (place-id API unavailable)');
}

// 6. no orphans
for (const generated of walk(publicRoot)) {
  const relative = path.relative(publicRoot, generated).split(path.sep).join('/');
  if (!sourceRelatives.has(relative)) {
    failures.push(`orphan generated file: vector/${relative}`);
  }
}

if (failures.length > 0) {
  console.error(failures.slice(0, 40).join('\n'));
  console.error(`\n${failures.length} vector verification failure(s)`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, sources: sourceRelatives.size }));
