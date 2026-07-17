import { cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  root: repositoryRoot,
  publicDir: false,
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    viteReact(),
    {
      name: 'copy-proof-public-assets',
      closeBundle() {
        cpSync(
          path.join(repositoryRoot, 'public'),
          path.join(repositoryRoot, 'workers/proof/dist'),
          { recursive: true }
        );
      },
    },
  ],
  build: {
    outDir: path.join(repositoryRoot, 'workers/proof/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(repositoryRoot, 'proof-capture.html'),
      output: {
        entryFileNames: 'proof-capture/[name]-[hash].js',
        chunkFileNames: 'proof-capture/[name]-[hash].js',
        assetFileNames: 'proof-capture/[name]-[hash][extname]',
      },
    },
  },
});
