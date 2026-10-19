import path from 'node:path';
import { fileURLToPath } from 'node:url';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

import { browserBundleBudgets } from '../../scripts/lib/browserBundleBudgets';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  root: repositoryRoot,
  /* Resolve shared static URLs; assembly supplies these files after the capture build. */
  publicDir: path.join(repositoryRoot, 'public'),
  resolve: { tsconfigPaths: true },
  plugins: [viteReact(), browserBundleBudgets()],
  build: {
    copyPublicDir: false,
    outDir: path.join(repositoryRoot, 'workers/publisher/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(repositoryRoot, 'publisher-capture.html'),
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'rulebook_contract',
              test: /\/src\/shared\/rulebooks\/pdfPublication\.ts$/u,
              maxSize: 500_000,
              entriesAware: true,
            },
          ],
        },
        entryFileNames: 'publisher-capture/[name]-[hash].js',
        chunkFileNames: 'publisher-capture/[name]-[hash].js',
        assetFileNames: 'publisher-capture/[name]-[hash][extname]',
      },
    },
  },
});
