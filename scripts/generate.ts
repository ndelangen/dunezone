import { join, relative } from 'node:path';

import { recursiveReaddirFiles } from 'recursive-readdir-files';

async function getFiles(path: string) {
  const dir = join(import.meta.dirname, '..', 'public', path);
  return (await recursiveReaddirFiles(dir))
    .map((f) => relative(join(dir, '..', '..'), f.path))
    .filter((f) => f.match(/\.(png|jpg|pdf|svg)$/));
}

// images
const leaders = await getFiles('/image/leader');
const planet = await getFiles('/image/planet');

// vectors
const background = await getFiles('/vector/background');
const generic = await getFiles('/vector/generic');
const decal = await getFiles('/vector/decal');
const icon = await getFiles('/vector/icon');
const logo = await getFiles('/vector/logo');
const troop = await getFiles('/vector/troop');
const troop_modifier = await getFiles('/vector/troop_modifier');

const enums = {
  background,
  generic,
  logo,
  decal,
  icon,
  leaders,
  planet,
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
