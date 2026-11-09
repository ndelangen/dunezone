import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
/* This standalone preview mounts only the throwaway route and never connects to a backend. */
import { createServer } from 'vite-plus';
const root = process.cwd();
const folder = '/src/app/routes/_tool/tools/bidding-prototype';
const server = await createServer({
  configFile: false,
  root,
  publicDir: resolve(root, 'public'),
  resolve: { tsconfigPaths: true },
  plugins: [
    react(),
    {
      name: 'bidding-prototype-entry',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.split('?')[0] === '/tools/bidding-prototype' || req.url === '/') {
            req.url = `${folder}/index.html`;
          }
          if (req.url?.startsWith('/play-fixtures/')) {
            req.url = '/.storybook/static' + req.url;
          }
          next();
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 4318, strictPort: true },
});
await server.listen();
console.log('Bidding flow review: http://127.0.0.1:4318/tools/bidding-prototype');
