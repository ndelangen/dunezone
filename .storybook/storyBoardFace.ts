import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite-plus';

const fixture = fileURLToPath(new URL('./static/play-fixtures/boards/arrakis-official.jpg', import.meta.url));
const BOARD_FACE = /^\/published\/boards\/[^/]+\/board\.jpg$/;

/**
 * Answers every published board face with the Arrakis board, so a story drawing a slotted board shows real art.
 * Storybook ids are not production ids, so no story could name a real publication, and Storybook's only board is Arrakis.
 * The fixture is `BoardMap` drawing Arrakis, which is what the publisher captures (`PublisherCapture.tsx`).
 * The static build gets the same answer from `static/_redirects`.
 */
export function storyBoardFace(): Plugin {
  return {
    name: 'dunezone:story-board-face',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!BOARD_FACE.test(request.url?.split('?')[0] ?? '')) {
          next();
          return;
        }
        try {
          response.setHeader('Content-Type', 'image/jpeg');
          response.end(await readFile(fixture));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
