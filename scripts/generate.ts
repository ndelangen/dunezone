import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { DOMParser } from 'linkedom';
import type { FormatConfig } from 'oxfmt';
import { format } from 'oxfmt';
import { recursiveReaddirFiles } from 'recursive-readdir-files';
import { Box2 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

import rasterLock from '../media/raster.lock.json';
import { compareCodeUnits } from '../src/shared/compareText';
import creditDefinitions from '../src/shared/media/credits.json';
import stockAssetCollections from '../src/shared/stockAssetCollections.json';
import { normalizeSvg } from '../src/shared/vectorNormalize';
import { VECTOR_ARTWORK_ALIASES } from '../src/shared/vectorRules';
import { linkedomDom } from './generate-vectors';

/* SVGLoader expects unset inline CSS values to be empty strings, while linkedom returns undefined. */
class PaintDOMParser {
  parseFromString(markup: string, mimeType: 'image/svg+xml') {
    const document = new DOMParser().parseFromString(markup, mimeType);
    for (const node of document.querySelectorAll('*')) {
      for (const property of [
        'fill',
        'fill-opacity',
        'fill-rule',
        'opacity',
        'stroke',
        'stroke-opacity',
        'stroke-width',
        'stroke-linejoin',
        'stroke-linecap',
        'stroke-miterlimit',
        'visibility',
      ]) {
        if (node.style.getPropertyValue(property) === undefined) {
          node.style.setProperty(property, '');
        }
      }
    }
    return document;
  }
}
(globalThis as { DOMParser?: unknown }).DOMParser = PaintDOMParser;

async function getFiles(path: string, root: 'public' | 'media' = 'public') {
  /*
   * Vector enums read the media/ sources (public/vector is generated output).
   * Keys keep their canonical shape; they are opaque asset ids stored on faction documents, resolved
   * via resolveAsset at render time.
   */
  const dir = join(import.meta.dirname, '..', root, path);
  return (await recursiveReaddirFiles(dir))
    .map((f) => relative(join(dir, '..', '..'), f.path))
    .filter((f) => f.match(/\.(png|jpg|pdf|svg)$/));
}

/* Raster keys come from the lock rather than the files, so this runs where the originals are not checked out. */
const rasterKeys = Object.keys(rasterLock);
const rastersIn = (directory: string) =>
  rasterKeys.filter((key) => key.startsWith(`${directory}/`)).map((key) => key.slice(1));
const leaders = rastersIn('/image/leader');
const planet = rastersIn('/image/planet');
const texture = rastersIn('/image/texture');

// vectors (media/ sources are truth; public/vector is generated output with identical names)
const background = await getFiles('/vector/background', 'media');
const generic = await getFiles('/vector/generic', 'media');
const decal = [...(await getFiles('/vector/decal', 'media')), ...rastersIn('/image/decal')];
const icon = await getFiles('/vector/icon', 'media');
const emblem = await getFiles('/vector/emblem', 'media');
const troop = await getFiles('/vector/troop', 'media');
const troop_modifier = await getFiles('/vector/troop_modifier', 'media');

/* Retired copies stay valid identifiers in their own category, so saved references keep parsing. */
const retiredIn = (category: string) =>
  Object.keys(VECTOR_ARTWORK_ALIASES)
    .filter((path) => path.startsWith(`/vector/${category}/`))
    .map((path) => path.slice(1));

const enums = {
  background,
  generic: [...generic, ...retiredIn('generic')],
  emblem,
  decal: [...decal, ...retiredIn('decal')],
  icon: [...icon, ...retiredIn('icon')],
  leaders,
  planet,
  texture,
  troop,
  troop_modifier,
};

/* Renaming a source breaks saved references; catalogue membership must use the same durable keys. */
const availableAssets = new Set(
  Object.values(enums)
    .flat()
    .map((path) => `/${path}`)
);
const classifiedAssets = new Set<string>();
for (const collection of stockAssetCollections) {
  for (const asset of collection.assets) {
    if (!availableAssets.has(asset) || classifiedAssets.has(asset)) {
      throw new Error(`Invalid or repeated artwork in ${collection.label}: ${asset}`);
    }
    classifiedAssets.add(asset);
  }
}
for (const asset of [...leaders, ...emblem, ...planet, ...decal, ...generic, ...troop]) {
  if (!classifiedAssets.has(`/${asset}`)) {
    throw new Error(`Add /${asset} to a browsing collection in src/shared/stockAssetCollections.json`);
  }
}

const assetIds = `import { z } from 'zod';

${Object.entries(enums)
  .map(
    ([name, files]) => `
export const ${name.toUpperCase()} = z.enum([
  ${files
    .sort()
    .map((file) => `'/${file}'`)
    .join(',\n  ')}
]);`
  )
  .join('\n')}

export const ALL = z.union([
  ${['GENERIC', 'EMBLEM', 'DECAL', 'ICON', 'TROOP'].join(',\n  ')}
]);
`;

/*
 * Written in the repository's own format, so regenerating leaves the committed file as it is.
 * The settings are read rather than imported: they shape only whitespace, and the output itself lands under src/shared.
 */
const { $schema: _schema, ...formatOptions } = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '.oxfmtrc.json'), 'utf8')
) as FormatConfig & { $schema?: string };
const formatted = await format('assetIds.ts', assetIds, formatOptions);
if (formatted.errors.length > 0) {
  throw new Error(`assetIds.ts did not format: ${formatted.errors.map((error) => error.message).join('; ')}`);
}
await Bun.write(join(import.meta.dirname, '..', 'src/shared/assetIds.ts'), formatted.code);

/* Search needs reviewed words and facets; byte-verification hashes stay in the source index. */
const mediaDirectory = join(import.meta.dirname, '..', 'src/app/routes/_app/media');
const mediaIndex = JSON.parse(readFileSync(join(mediaDirectory, 'media-index.json'), 'utf8')) as Record<
  string,
  { description: string; tags: string[]; subjects: string[]; credit: string; creditDetail?: string; sourceHash: string }
>;
const searchIndex = Object.fromEntries(
  Object.entries(mediaIndex).map(([key, { description, tags, subjects }]) => [key, { description, tags, subjects }])
);
const searchIndexOutput = await format('mediaSearchIndex.generated.json', JSON.stringify(searchIndex), formatOptions);
if (searchIndexOutput.errors.length > 0) {
  throw new Error(
    `Media search index did not format: ${searchIndexOutput.errors.map((error) => error.message).join('; ')}`
  );
}
await Bun.write(join(mediaDirectory, 'mediaSearchIndex.generated.json'), searchIndexOutput.code);

/* Pickers credit stock artwork without loading the search index, so paths are grouped by credit and folder. */
const creditFiles: Record<string, Record<string, string[]>> = {};
const creditDetails: Record<string, string> = {};
for (const [key, { credit, creditDetail }] of Object.entries(mediaIndex).sort(([a], [b]) => compareCodeUnits(a, b))) {
  if (!Object.hasOwn(creditDefinitions, credit)) {
    throw new Error(`${key} names credit "${credit}", which src/shared/media/credits.json does not define`);
  }
  const folder = key.slice(0, key.lastIndexOf('/') + 1);
  ((creditFiles[credit] ??= {})[folder] ??= []).push(key.slice(folder.length));
  if (creditDetail) {
    creditDetails[key] = creditDetail;
  }
}
const creditIndexOutput = await format(
  'credits.generated.json',
  JSON.stringify({ files: creditFiles, details: creditDetails }),
  formatOptions
);
if (creditIndexOutput.errors.length > 0) {
  throw new Error(
    `Media credit index did not format: ${creditIndexOutput.errors.map((error) => error.message).join('; ')}`
  );
}
await Bun.write(join(import.meta.dirname, '..', 'src/shared/media/credits.generated.json'), creditIndexOutput.code);

/* Geometry retains the artwork's shape and centre without depending on a platform's raster encoder. */
const vectorCrops: Record<string, readonly [number, number, number, number]> = {};
const loader = new SVGLoader();
for (const key of [...generic, ...emblem, ...decal, ...icon, ...troop]
  .filter((key) => key.endsWith('.svg'))
  .sort((a, b) => (a < b ? -1 : Number(a > b)))) {
  const source = readFileSync(join(import.meta.dirname, '..', 'media', key), 'utf8');
  const bounds = new Box2();
  for (const path of loader.parse(normalizeSvg(source, linkedomDom)).paths) {
    const style = path.userData?.style;
    if (
      style &&
      typeof style === 'object' &&
      'fill' in style &&
      style.fill === 'none' &&
      (!('stroke' in style) || style.stroke === 'none')
    ) {
      continue;
    }
    const pathBounds = new Box2().setFromPoints(path.subPaths.flatMap((subPath) => subPath.getPoints(64)));
    if (
      style &&
      typeof style === 'object' &&
      'stroke' in style &&
      typeof style.stroke === 'string' &&
      style.stroke !== 'none'
    ) {
      const strokeWidth = 'strokeWidth' in style && typeof style.strokeWidth === 'number' ? style.strokeWidth : 1;
      pathBounds.expandByScalar(strokeWidth / 2);
    }
    bounds.union(pathBounds);
  }
  if (bounds.isEmpty()) {
    /* Empty catalogue placeholders, such as the CHOAM emblem, retain the full square. */
    vectorCrops[`/${key}`] = [50, 50, 100, 100];
    continue;
  }
  /* Curves are sampled densely, with a small outward allowance before rounding. */
  const left = Math.max(0, Math.floor((bounds.min.x - 0.05) * 100) / 100);
  const top = Math.max(0, Math.floor((bounds.min.y - 0.05) * 100) / 100);
  const right = Math.min(100, Math.ceil((bounds.max.x + 0.05) * 100) / 100);
  const bottom = Math.min(100, Math.ceil((bounds.max.y + 0.05) * 100) / 100);
  vectorCrops[`/${key}`] = [
    (left + right) / 2,
    (top + bottom) / 2,
    Number((right - left).toFixed(2)),
    Number((bottom - top).toFixed(2)),
  ];
}
const crops = await format(
  'vectorCrops.generated.ts',
  `/** Generated by bun run generate. Each crop is [centre x, centre y, width, height] in the normalized 100-unit square. */\nexport const VECTOR_CROPS = ${JSON.stringify(vectorCrops)} as const;\n`,
  formatOptions
);
if (crops.errors.length > 0) {
  throw new Error(`Vector crops did not format: ${crops.errors.map((error) => error.message).join('; ')}`);
}
await Bun.write(join(import.meta.dirname, '..', 'src/shared/media/vectorCrops.generated.ts'), crops.code);
