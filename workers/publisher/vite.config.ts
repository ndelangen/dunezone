import path from 'node:path';
import { fileURLToPath } from 'node:url';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

import { browserBundleBudgets } from '../../scripts/lib/browserBundleBudgets';
import { quietBuildReportInCi } from '../../scripts/lib/quietBuildReport';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  root: repositoryRoot,
  /* Resolve shared static URLs; assembly supplies these files after the capture build. */
  publicDir: path.join(repositoryRoot, 'public'),
  resolve: { tsconfigPaths: true },
  plugins: [viteReact(), browserBundleBudgets(), quietBuildReportInCi()],
  build: {
    copyPublicDir: false,
    outDir: path.join(repositoryRoot, 'workers/publisher/dist'),
    emptyOutDir: true,
    /* CI hides the per-file report (quietBuildReportInCi), so it skips gzipping every file just to size it. */
    reportCompressedSize: !process.env.CI,
    rollupOptions: {
      input: path.join(repositoryRoot, 'publisher-capture.html'),
      output: {
        /* Chunk boundaries must not evaluate schemas before their shared contracts. */
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'rulebook_contract',
              test: /\/src\/shared\/rulebooks\/pdfPublication\.ts$/u,
              maxSize: 500_000,
              entriesAware: true,
            },
            /* The generated crop table grows with every stock vector; keep it out of the capture entry's budget. */
            {
              name: 'vector_crops',
              test: /\/src\/shared\/media\/vectorCrops\.generated\.ts$/u,
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
