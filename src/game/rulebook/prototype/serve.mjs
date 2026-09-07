/** Run with bun src/game/rulebook/prototype/serve.mjs. */
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const prototypeRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(prototypeRoot, '../../../..');
const entry = '/prototype/rulebook-layouts/';
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PROTOTYPE_PORT || 0),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === entry.slice(0, -1)) {
      return Response.redirect(new URL(entry + url.search, url), 302);
    }
    let file;
    if (url.pathname.startsWith(entry)) {
      file = resolve(prototypeRoot, decodeURIComponent(url.pathname.slice(entry.length)) || 'index.html');
    } else if (url.pathname.startsWith('/media/')) {
      file = resolve(repositoryRoot, `.${decodeURIComponent(url.pathname)}`);
    } else if (url.pathname.startsWith('/font/')) {
      file = resolve(repositoryRoot, `public${decodeURIComponent(url.pathname)}`);
    } else if (url.pathname.startsWith('/node_modules/@fontsource/caladea/files/')) {
      file = resolve(repositoryRoot, `.${decodeURIComponent(url.pathname)}`);
    }
    if (
      !file ||
      ![
        prototypeRoot,
        resolve(repositoryRoot, 'media'),
        resolve(repositoryRoot, 'public/font'),
        resolve(repositoryRoot, 'node_modules/@fontsource/caladea/files'),
      ].some((base) => file.startsWith(`${base}/`))
    ) {
      return new Response('Not found', { status: 404 });
    }
    const asset = Bun.file(file);
    if (!(await asset.exists())) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(asset, {
      headers: {
        'Cache-Control': 'no-store',
        ...(extname(file) === '.mjs' ? { 'Content-Type': 'text/javascript' } : {}),
      },
    });
  },
});
console.log(`Rulebook prototype: http://127.0.0.1:${server.port}${entry}?variant=A&format=square`);
