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
  ssr: { noExternal: true },
  build: {
    ssr: path.join(repositoryRoot, 'src/app/print/rulebookHtmlRuntime.ts'),
    outDir: path.join(repositoryRoot, 'workers/publisher/runtime-generated'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'rulebook-html-renderer.mjs',
        format: 'es',
      },
    },
  },
});
