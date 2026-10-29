import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { publishedPath } from '../src/shared/asset-publishing/publicationTargets';
import { SPICE_TOKEN_HREF } from '../src/shared/play/spiceToken';
import players from '../src/shared/tutorial/players.json';

/*
 * Copies every published image the tutorial setup names into Storybook's static files, at the same path,
 * so the tutorial's stories show the real art without ever contacting the site.
 * The site keeps serving the live images; only Storybook reads this copy. Board faces are left out: Storybook answers those already.
 * A token laid on a card (a Spice card's board token) is named only by its asset id, so its image is looked for under each token shape.
 * The spice token the table lays out for every bank is mirrored too, since the setup does not name it.
 * Usage, after `bun run tutorial:pull`: bun run tutorial:mirror (TUTORIAL_SITE defaults to https://dune.zone)
 */

const ROOT = path.join(import.meta.dirname, '..');
const site = process.env.TUTORIAL_SITE ?? 'https://dune.zone';
const catalogue = await readFile(path.join(ROOT, 'src/app/routes/_app/tutorial/setup/catalogue.json'), 'utf8');
/* A chapter's own pieces, such as the Kwisatz Haderach tracker, name their published images in the chapter's script. */
const SCRIPTS = path.join(ROOT, 'src/app/routes/_app/tutorial/chapterScripts');
const scripts = await Promise.all(
  (await readdir(SCRIPTS))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => readFile(path.join(SCRIPTS, file), 'utf8'))
);
const paths = new Set(
  [...[catalogue, ...scripts].join('\n').matchAll(/(?:https?:\/\/[^/"']+)?(\/published\/[^"'?]+)/g)]
    .map((match) => match[1]!)
    .filter((address) => !address.startsWith('/published/boards/'))
    .concat(SPICE_TOKEN_HREF)
);
const TOKEN_TYPES = ['token-disc', 'token-tech', 'token-plate', 'token-pointer', 'token-enhance'] as const;
const tokenIds = new Set([...catalogue.matchAll(/"asset_id":\s*"([^"]+)"/g)].map((match) => match[1]!));

let bytes = 0;
async function mirror(address: string) {
  const response = await fetch(new URL(address, site));
  if (!response.ok) {
    return response.status;
  }
  const body = new Uint8Array(await response.arrayBuffer());
  const target = path.join(ROOT, '.storybook/static', address);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
  bytes += body.byteLength;
  return null;
}
for (const address of [...paths].sort((a, b) => a.localeCompare(b))) {
  const failed = await mirror(address);
  if (failed !== null) {
    throw new Error(`${address} answered ${failed}.`);
  }
}
for (const id of [...tokenIds].sort((a, b) => a.localeCompare(b))) {
  const candidates = TOKEN_TYPES.map((type) => publishedPath(type, id)).filter((address) => !paths.has(address));
  let found = false;
  for (const address of candidates) {
    if ((await mirror(address)) === null) {
      paths.add(address);
      found = true;
      break;
    }
  }
  if (!found && candidates.length === TOKEN_TYPES.length) {
    console.warn(`No published token image answered for ${id}; its stories show it blank.`);
  }
}
console.log(
  `Mirrored ${paths.size} published images (${(bytes / 1e6).toFixed(1)} MB) into .storybook/static/published.`
);

/* Keep player portraits available to isolated stories. */
for (const player of players.profiles) {
  const response = await fetch(player.image);
  if (!response.ok) {
    throw new Error(`Could not mirror ${player.slug}: ${response.status}`);
  }
  await Bun.write(`.storybook/static${new URL(player.image).pathname}`, response);
}
