/** Throwaway, read-only GF9 document review. No Convex connection or application mutations. */
import { createServer } from 'vite-plus';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('./', import.meta.url));
const repo = path.resolve(root, '../../..');
const types: Record<string, string> = { '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf' };
const server = await createServer({
  configFile: false,
  root,
  publicDir: path.join(root, 'public'),
  plugins: [react(), {
    name: 'prototype-public-assets',
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!['/font/', '/page/', '/vector/', '/image/'].some(prefix => url.pathname.startsWith(prefix))) return next();
        const directory = url.pathname.startsWith('/vector/') ? 'media' : 'public';
        const candidate = path.resolve(repo, directory, '.' + decodeURIComponent(url.pathname));
        const publicRoot = path.join(repo, directory) + path.sep;
        if (!candidate.startsWith(publicRoot) || !existsSync(candidate)) return next();
        res.setHeader('Content-Type', types[path.extname(candidate)] ?? 'application/octet-stream');
        res.end(readFileSync(candidate));
      });
    },
  }],
  resolve: { alias: { '@shared': path.join(repo, 'src/shared'), '@game': path.join(repo, 'src/game') } },
  server: { host: '127.0.0.1', port: 39611, strictPort: true, fs: { allow: [repo] } },
});
await server.listen();
console.log('GF9 composition prototype: http://127.0.0.1:39611/?variant=A');
console.log('Read-only document prototype. The persistent local Dune Zone environment is a separate implementation.');
