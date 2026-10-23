import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const outdir = '/tmp/gf9-2-0-preview';
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
const css = result.outputs
  .filter((file) => file.path.endsWith('.css'))
  .map((file) => `<link rel="stylesheet" href="/${file.path.split('/').at(-1)}">`)
  .join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GF9 2.0 local rulebook draft</title>${css}<style>body{margin:0;padding:20px;background:#282723;font-family:Arial,sans-serif}.previewToolbar{color:white;max-width:960px;margin:0 auto 24px;display:grid;gap:12px}.previewToolbar nav{display:flex;flex-wrap:wrap;gap:8px}.previewToolbar a{color:#ffe3a8}.rulebookDocument{max-width:960px;margin:auto}@media print{body{padding:0;background:white}.previewToolbar{display:none}.rulebookDocument{display:block;max-width:none}.rulebookPage{break-after:page}}</style></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>`;
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 4317,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path.includes('..')) {
      return new Response('Not found', { status: 404 });
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
      return fetch(`https://dune.zone${path}`);
    }
    return new Response('Not found', { status: 404 });
  },
});
console.log(`Local rulebook preview: ${server.url}`);
