import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/*
 * Copies every published image the tutorial setup names into Storybook's static files, at the same path,
 * so the tutorial's stories show the real art without ever contacting the site.
 * The site keeps serving the live images; only Storybook reads this copy. Board faces are left out: Storybook answers those already.
 * Usage, after `bun run tutorial:pull`: bun run tutorial:mirror (TUTORIAL_SITE defaults to https://dune.zone)
 */

const ROOT = path.join(import.meta.dirname, '..');
const site = process.env.TUTORIAL_SITE ?? 'https://dune.zone';
const catalogue = await readFile(path.join(ROOT, 'src/app/routes/_app/tutorial/setup/catalogue.json'), 'utf8');
const paths = new Set(
  [...catalogue.matchAll(/(?:https?:\/\/[^/"]+)?(\/published\/[^"?]+)/g)]
    .map((match) => match[1]!)
    .filter((address) => !address.startsWith('/published/boards/'))
);
let bytes = 0;
for (const address of [...paths].sort((a, b) => a.localeCompare(b))) {
  const response = await fetch(new URL(address, site));
  if (!response.ok) {
    throw new Error(`${address} answered ${response.status}.`);
  }
  const body = new Uint8Array(await response.arrayBuffer());
  const target = path.join(ROOT, '.storybook/static', address);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
  bytes += body.byteLength;
}
console.log(
  `Mirrored ${paths.size} published images (${(bytes / 1e6).toFixed(1)} MB) into .storybook/static/published.`
);
