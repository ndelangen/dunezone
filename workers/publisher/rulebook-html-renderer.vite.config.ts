import path from 'node:path';
import { fileURLToPath } from 'node:url';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Rolldown } from 'vite';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeEntry = 'virtual:rulebook-html-runtime';
const emittedCssMarker = '__RULEBOOK_EMITTED_RENDERER_CSS__';

function takeRendererCss(bundle: Rolldown.OutputBundle) {
  const styles = Object.values(bundle).flatMap((file) =>
    file.type === 'asset' && file.fileName.endsWith('.css') ? [file] : []
  );
  if (styles.length === 0) {
    throw new Error('The Rulebook HTML runtime must include its emitted renderer styles.');
  }
  const css = styles
    .map((file) => (typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source)))
    .join('\n');
  for (const file of styles) {
    delete bundle[file.fileName];
  }
  return css;
}

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
          const css = takeRendererCss(bundle);
          const entry = Object.values(bundle).find((file) => file.type === 'chunk' && file.isEntry);
          if (entry?.type !== 'chunk') {
            throw new Error('The Rulebook HTML runtime must include an entry chunk.');
          }
          const marker = JSON.stringify(emittedCssMarker);
          if (!entry.code.includes(marker)) {
            throw new Error('The Rulebook HTML runtime must include its renderer styles placeholder.');
          }
          entry.code = entry.code.replace(marker, JSON.stringify(css));
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
