import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite-plus';

const fixture = (path: string) => fileURLToPath(new URL(`./static/play-fixtures/${path}`, import.meta.url));

/*
 * Each published face a story can name, with the fixture that answers it.
 * Storybook ids are not production ids, so no story could name a real publication: Storybook's only board is Arrakis,
 * its seeded tokens use IDs beginning with a run of zeros.
 */
const FIXTURES = [
  { path: /^\/published\/boards\/[^/]+\/board\.jpg$/, file: fixture('boards/arrakis-official.jpg') },
  { path: /^\/published\/round-tokens\/0{20}[^/]*\/token\.jpg$/, file: fixture('tokens/karama.jpg') },
  { path: /^\/published\/pointer-tokens\/0{20}[^/]*\/token\.jpg$/, file: fixture('tokens/hms.jpg') },
  /* The baseline's one faction is House Atreides, so a seeded faction's published token is the Atreides token. */
  { path: /^\/published\/faction-tokens\/0{10,}[^/]*\/token\.jpg$/, file: fixture('product/house-atreides-token.jpg') },
];

/**
 * Answers every published board face with the Arrakis board, seeded round tokens with Karama, seeded pointer tokens with HMS, and seeded faction tokens with House Atreides's.
 * The board fixture is `BoardMap` drawing Arrakis, which is what the publisher captures (`PublisherCapture.tsx`).
 * Karama is the token editor drawing the database's token.
 * HMS is the published 600 px image.
 * Both the Storybook builder and the story test runner register it.
 * The static build gets the same answer from `static/_redirects`.
 */
export function storyBoardFace(): Plugin {
  return {
    name: 'dunezone:story-board-face',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const answer = FIXTURES.find(({ path }) => path.test(request.url?.split('?')[0] ?? ''));
        if (!answer) {
          next();
          return;
        }
        try {
          response.setHeader('Content-Type', 'image/jpeg');
          response.end(await readFile(answer.file));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
