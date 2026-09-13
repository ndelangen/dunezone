import path from 'node:path';
import { fileURLToPath } from 'node:url';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeEntry = 'virtual:rulebook-html-runtime';
const emittedCssMarker = '__RULEBOOK_EMITTED_RENDERER_CSS__';

export default defineConfig({
  root: repositoryRoot,
  publicDir: false,
  resolve: { tsconfigPaths: true },
  plugins: [
    viteReact(),
    {
      name: 'rulebook-html-emitted-css',
      enforce: 'post',
      resolveId(id) {
        return id === runtimeEntry ? `\0${runtimeEntry}` : undefined;
      },
      load(id) {
        if (id !== `\0${runtimeEntry}`) {
          return;
        }
        const runtime = path.join(repositoryRoot, 'src/app/print/rulebookHtmlRuntime.ts');
        return `export { renderRulebookHtmlDocument } from ${JSON.stringify(runtime)};
export const rulebookRendererCss = ${JSON.stringify(emittedCssMarker)};`;
      },
      generateBundle: {
        order: 'post',
        handler(_, bundle) {
          const styles = Object.values(bundle).flatMap((file) =>
            file.type === 'asset' && file.fileName.endsWith('.css') ? [file] : []
          );
          const entry = Object.values(bundle).find((file) => file.type === 'chunk' && file.isEntry);
          if (
            styles.length === 0 ||
            entry?.type !== 'chunk' ||
            !entry.code.includes(JSON.stringify(emittedCssMarker))
          ) {
            throw new Error('The Rulebook HTML runtime must include its emitted renderer styles.');
          }
          const css = styles
            .map((file) => (typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source)))
            .join('\n');
          entry.code = entry.code.replace(JSON.stringify(emittedCssMarker), JSON.stringify(css));
          for (const file of styles) {
            delete bundle[file.fileName];
          }
        },
      },
    },
  ],
  ssr: { noExternal: true },
  build: {
    ssr: true,
    ssrEmitAssets: true,
    cssCodeSplit: false,
    outDir: path.join(repositoryRoot, 'workers/publisher/runtime-generated'),
    emptyOutDir: true,
    rollupOptions: {
      input: runtimeEntry,
      output: {
        entryFileNames: 'rulebook-html-renderer.mjs',
        format: 'es',
      },
    },
  },
});
