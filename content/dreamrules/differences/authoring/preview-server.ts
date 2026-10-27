import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const outdir = '/tmp/gf9-dream-differences-preview';
const result = await Bun.build({
  entrypoints: [`${here}/preview.tsx`],
  target: 'browser',
  outdir,
  minify: false,
  loader: { '.woff2': 'file', '.woff': 'file' },
  external: ['/font/*', '/vector/*', '/image/*', '/page/*'],
});
if (!result.success) {
  throw new AggregateError(result.logs, 'Preview bundle failed');
}
// Bun's legacy :-webkit-any fallback changes specificity in WebKit. Keep the
// same :is selectors as the production renderer so numbered lists stay numbered.
for (const output of result.outputs.filter((file) => file.path.endsWith('.css'))) {
  await Bun.write(output.path, (await output.text()).replaceAll(':-webkit-any(', ':is('));
}
const css = result.outputs
  .filter((file) => file.path.endsWith('.css'))
  .map((file) => `<link rel="stylesheet" href="/${file.path.split('/').at(-1)}">`)
  .join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GF9 Advanced to Dreamrules - local review</title>${css}<style>body{margin:0;padding:20px;background:#282723;font-family:Arial,sans-serif}.previewToolbar{color:white;max-width:960px;margin:0 auto 24px;display:grid;gap:12px}.previewToolbar nav{display:flex;flex-wrap:wrap;gap:8px}.previewToolbar a{color:#ffe3a8}.rulebookDocument{max-width:960px;margin:auto}@media print{body{padding:0;background:white}.previewToolbar{display:none}.rulebookDocument{display:block;max-width:none}.rulebookPage{break-after:page}}</style></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>`;
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 4321,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path.includes('..')) {
      return new Response('Not found', { status: 404 });
    }
    if (path === '/render-document.json') {
      return new Response(Bun.file(`${here}/render-document.json`));
    }
    if (path === '/') {
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }
    for (const base of [outdir, `${root}/public`]) {
      const file = Bun.file(`${base}${path}`);
      if (await file.exists()) {
        return new Response(file);
      }
    }
    if (/^\/(m|image|vector|page|font)\//.test(path)) {
      const response = await fetch(`https://dune.zone${path}`);
      return new Response(response.body, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream' },
      });
    }
    return new Response('Not found', { status: 404 });
  },
});
console.log(`Local Dreamrules differences preview: ${server.url}`);
