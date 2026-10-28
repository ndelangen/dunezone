import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite-plus';

const fixture = (path: string) => fileURLToPath(new URL(`./static/play-fixtures/${path}`, import.meta.url));

/*
 * Each published face a story can name, with the fixture that answers it.
 * Storybook ids are not production ids, so no story could name a real publication: Storybook's only board is Arrakis,
 * and its only published round token is the Karama of its database (`src/app/db/storybook/database.ts`), whose ids start with twenty zeros.
 */
const FIXTURES = [
  { path: /^\/published\/boards\/[^/]+\/board\.jpg$/, file: fixture('boards/arrakis-official.jpg') },
  { path: /^\/published\/round-tokens\/0{20}[^/]*\/token\.jpg$/, file: fixture('tokens/karama.jpg') },
];

/**
 * Answers every published board face with the Arrakis board and every seeded round token with Karama, so a story drawing them shows real art.
 * The board fixture is `BoardMap` drawing Arrakis, which is what the publisher captures (`PublisherCapture.tsx`);
 * the token is the token editor drawing the database's Karama at the publisher's 600 px.
 * Both the Storybook builder and the story test runner register it;
 * the static build gets the same answer from `static/_redirects`.
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
