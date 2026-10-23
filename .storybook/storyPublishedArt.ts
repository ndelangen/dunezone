import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite-plus';

const MIRROR = fileURLToPath(new URL('./static', import.meta.url));
const CATALOGUE = fileURLToPath(new URL('../src/app/routes/_app/tutorial/setup/catalogue.json', import.meta.url));
const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * Answers the tutorial's `/published/...` art in the Storybook server and the story test runner the way the deployed
 * Storybook Worker does (`workers/storybook/index.ts`): from the site, so the tutorial's chapters show its live cards and tokens.
 * The first answer is kept in `static/published/`, the copy `bun run tutorial:mirror` makes, so a later run reads it offline.
 * TUTORIAL_SITE names the site, dune.zone by default.
 * Only the paths the tutorial's catalogue names are answered, the same list `tutorial:mirror` copies, so every other story keeps the missing images it expects.
 * Board faces stay with `storyBoardFace`.
 */
export function storyPublishedArt(site = process.env.TUTORIAL_SITE ?? 'https://dune.zone'): Plugin {
  let paths: Promise<Set<string>> | undefined;
  /* Read once, on the first image request: every `/published/...` path the catalogue names, board faces aside. */
  const tutorialArt = () =>
    (paths ??= readFile(CATALOGUE, 'utf8').then(
      (catalogue) =>
        new Set(
          [...catalogue.matchAll(/(?:https?:\/\/[^/"]+)?(\/published\/[^"?]+)/g)]
            .map((match) => match[1]!)
            .filter((address) => !address.startsWith('/published/boards/'))
        )
    ));
  return {
    name: 'dunezone:story-published-art',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const address = request.url?.split('?')[0] ?? '';
        if (!address.startsWith('/published/') || !(await tutorialArt()).has(address)) {
          next();
          return;
        }
        const copy = path.join(MIRROR, address);
        try {
          let bytes: Uint8Array;
          if (existsSync(copy)) {
            bytes = await readFile(copy);
          } else {
            const answer = await fetch(new URL(address, site));
            if (!answer.ok) {
              response.statusCode = answer.status;
              response.end();
              return;
            }
            bytes = new Uint8Array(await answer.arrayBuffer());
            await mkdir(path.dirname(copy), { recursive: true });
            /* Written aside and moved in whole, so a request for the same image meanwhile never reads half a file. */
            const partial = `${copy}.${process.pid}.${Math.random().toString(36).slice(2)}.part`;
            await writeFile(partial, bytes);
            await rename(partial, copy);
          }
          response.setHeader('Content-Type', TYPES[path.extname(address).toLowerCase()] ?? 'application/octet-stream');
          response.end(bytes);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
