import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { transform } from 'esbuild';
import type { Plugin } from 'vite-plus';

const source = fileURLToPath(new URL('../workers/storybook/story-images.sw.ts', import.meta.url));
const filename = 'story-images.sw.js';

/** Serves and builds the image worker at the same stable URL its registration uses. */
export function storyImagesWorker(): Plugin {
  const compile = async () =>
    (await transform(await readFile(source, 'utf8'), { loader: 'ts', target: 'es2022', format: 'iife' })).code;
  return {
    name: 'dunezone:story-images-worker',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== `/${filename}`) {
          next();
          return;
        }
        try {
          response.setHeader('Content-Type', 'text/javascript');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(await compile());
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: filename, source: await compile() });
    },
  };
}
