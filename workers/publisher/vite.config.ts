import path from 'node:path';
import { fileURLToPath } from 'node:url';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  root: repositoryRoot,
  publicDir: false,
  resolve: { tsconfigPaths: true },
  plugins: [viteReact()],
  build: {
    outDir: path.join(repositoryRoot, 'workers/publisher/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(repositoryRoot, 'publisher-capture.html'),
      output: {
        entryFileNames: 'publisher-capture/[name]-[hash].js',
        chunkFileNames: 'publisher-capture/[name]-[hash].js',
        assetFileNames: 'publisher-capture/[name]-[hash][extname]',
      },
    },
  },
});
