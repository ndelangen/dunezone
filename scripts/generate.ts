import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { FormatConfig } from 'oxfmt';
import { format } from 'oxfmt';
import { recursiveReaddirFiles } from 'recursive-readdir-files';

import stockAssetCollections from '../src/shared/stockAssetCollections.json';

async function getFiles(path: string, root: 'public' | 'media' = 'public') {
  /*
   * Image enums read the media/ sources (public/image is generated output), but keys keep their
   * canonical /image/... shape; they are opaque asset ids stored on faction documents, resolved
   * via resolveAsset at render time.
   */
  const dir = join(import.meta.dirname, '..', root, path);
  return (await recursiveReaddirFiles(dir))
    .map((f) => relative(join(dir, '..', '..'), f.path))
    .filter((f) => f.match(/\.(png|jpg|pdf|svg)$/));
}

const leaders = await getFiles('/image/leader', 'media');
const planet = await getFiles('/image/planet', 'media');
const texture = await getFiles('/image/texture', 'media');

// vectors (media/ sources are truth; public/vector is generated output with identical names)
const background = await getFiles('/vector/background', 'media');
const generic = await getFiles('/vector/generic', 'media');
const decal = await getFiles('/vector/decal', 'media');
const icon = await getFiles('/vector/icon', 'media');
const logo = await getFiles('/vector/logo', 'media');
const troop = await getFiles('/vector/troop', 'media');
const troop_modifier = await getFiles('/vector/troop_modifier', 'media');

const enums = {
  background,
  generic,
  logo,
  decal,
  icon,
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
for (const asset of [...leaders, ...logo, ...planet, ...decal]) {
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
  ${['GENERIC', 'LOGO', 'DECAL', 'ICON', 'TROOP'].join(',\n  ')}
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
