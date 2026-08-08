import { join, relative } from 'node:path';

import { recursiveReaddirFiles } from 'recursive-readdir-files';

async function getFiles(path: string, root: 'public' | 'media' = 'public') {
  // Image enums read the media/ sources (public/image is generated output),
  // but keys keep their canonical /image/... shape — they are opaque asset
  // ids stored on faction documents, resolved via resolveAsset at render time.
  const dir = join(import.meta.dirname, '..', root, path);
  return (await recursiveReaddirFiles(dir))
    .map((f) => relative(join(dir, '..', '..'), f.path))
    .filter((f) => f.match(/\.(png|jpg|pdf|svg)$/));
}

// images
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

await Bun.write(
  join(import.meta.dirname, '..', 'src/game/data/generated.ts'),
  `
import { z } from 'zod';

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
`
);
