import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
/** Throwaway component-treatment review across several asset types. Public reads only; no database. */
import { createServer } from 'vite-plus';

import { unsyncedMediaPreview } from '../../../scripts/lib/unsyncedMediaPreview';
const root = fileURLToPath(new URL('./', import.meta.url));
const repo = path.resolve(root, '../../..');
const cache = path.join(root, 'public/cache');
const mime: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const server = await createServer({
  configFile: false,
  root,
  publicDir: path.join(root, 'public'),
  plugins: [
    unsyncedMediaPreview(repo),
    react(),
    {
      name: 'prototype-maintained-assets',
      configureServer(s) {
        s.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          if (!['/font/', '/image/', '/m/', '/vector/', '/page/'].some((p) => url.pathname.startsWith(p)))
            return next();
          const rel = decodeURIComponent(url.pathname);
          if (rel.includes('..')) {
            res.statusCode = 400;
            return res.end();
          }
          // Renderers consume normalized generated vectors, never the raw media originals.
          const local = path.join(repo, 'public', rel);
          if (existsSync(local)) {
            res.setHeader('Content-Type', mime[path.extname(local)] ?? 'application/octet-stream');
            return res.end(readFileSync(local));
          }
          const key = createHash('sha256').update(rel).digest('hex') + path.extname(rel);
          const file = path.join(cache, key);
          if (!existsSync(file)) {
            const response = await fetch('https://dune.zone' + url.pathname);
            if (!response.ok) {
              res.statusCode = response.status;
              return res.end('Maintained asset unavailable');
            }
            const bytes = Buffer.from(await response.arrayBuffer());
            mkdirSync(cache, { recursive: true });
            writeFileSync(file, bytes);
            const entry = {
              source: 'https://dune.zone' + url.pathname,
              file: 'cache/' + key,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              bytes: bytes.length,
            };
            const index = path.join(cache, 'manifest.json');
            const existing = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')) : {};
            existing[rel] = entry;
            writeFileSync(index, JSON.stringify(existing, null, 2) + '\n');
          }
          res.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
          res.end(readFileSync(file));
        });
      },
    },
  ],
  resolve: { alias: { '@shared': path.join(repo, 'src/shared'), '@game': path.join(repo, 'src/game') } },
  server: { host: '127.0.0.1', port: 39612, strictPort: true, fs: { allow: [repo] } },
});
await server.listen();
console.log('GF9 component prototype http://127.0.0.1:39612/?case=headers&variant=A');
