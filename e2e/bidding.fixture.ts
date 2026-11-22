import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

import { ConvexHttpClient } from 'convex/browser';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type { V4WorkerdStructuredLog } from 'miniflare';
import { z } from 'zod';

import { api } from '../convex/_generated/api';

const workerConfigSchema = z.object({
  compatibility_date: z.string(),
  compatibility_flags: z.array(z.string()),
  durable_objects: z.object({ bindings: z.array(z.object({ name: z.string(), class_name: z.string() })) }),
});

function loopback(value: string) {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('The bidding browser fixture only runs against loopback services.');
  }
  return url;
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  await new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())));
  if (!address || typeof address === 'string') {
    throw new Error('The bidding browser fixture did not receive a loopback port.');
  }
  return address.port;
}

/** Test data comes from the same guarded local backend as the other E2E fixtures. */
export async function seedBiddingCatalogue() {
  const backend = loopback(process.env.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3210');
  const client = new ConvexHttpClient(backend.origin);
  return await client.mutation(api.e2e.seedBiddingTable, {
    ownerEmail: process.env.PLAYWRIGHT_USER_A_EMAIL ?? 'e2e-user-a@example.com',
    slug: `bidding-${crypto.randomUUID()}`,
  });
}

/**
 * The ordinary E2E server has no Worker.
 * This disposable origin runs the production game entry and forwards only application files to that server.
 * Both browser contexts use real WebSockets and WebRTC against this origin, with no simulated relay.
 */
export async function startBiddingBrowserRuntime(assetOrigin: string) {
  const source = loopback(assetOrigin);
  const backend = loopback(process.env.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3210');
  const root = resolve(import.meta.dirname, '..');
  const config = workerConfigSchema.parse(
    JSON.parse(await readFile(resolve(root, 'workers/game/wrangler.jsonc'), 'utf8'))
  );
  const entry = resolve(root, 'workers/game/index.ts');
  const compiled = await build({
    stdin: {
      contents: `
        import game from ${JSON.stringify(entry)};
        export * from ${JSON.stringify(entry)};
        export default {
          fetch(request, env, ctx) {
            const url = new URL(request.url);
            if (url.pathname.startsWith('/__play/')) return game.fetch(request, env, ctx);
            if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, {status:405});
            return fetch(new Request(new URL(url.pathname + url.search, env.E2E_ASSET_ORIGIN), request));
          }
        };
      `,
      resolveDir: root,
      sourcefile: 'bidding-browser-fixture.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    external: ['cloudflare:workers', 'node:*'],
  });
  const script = compiled.outputFiles[0]?.text;
  if (!script) {
    throw new Error('The bidding browser fixture did not compile the game Worker.');
  }
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const logs: V4WorkerdStructuredLog[] = [];
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      handleStructuredLogs: (log) => logs.push(log),
      rootPath: root,
      host: '127.0.0.1',
      port,
      modules: true,
      script,
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      durableObjects: Object.fromEntries(
        config.durable_objects.bindings.map((binding) => [
          binding.name,
          {
            className: binding.class_name,
            useSQLite: true,
          },
        ])
      ),
      bindings: {
        APPLICATION_ORIGIN: origin,
        CONVEX_URL: backend.origin,
        E2E_ASSET_ORIGIN: source.origin,
        GIT_SHA: 'bidding-browser-fixture',
        CF_VERSION_METADATA: { id: 'bidding-browser-fixture', tag: 'bidding-browser-fixture' },
      },
    })
  );
  try {
    await runtime.ready;
    const response = await fetch(`${origin}/__play/health`);
    if (!response.ok) {
      throw new Error(`The bidding browser Worker failed its health check: ${response.status}`);
    }
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
  return { origin, logs, close: () => runtime.dispose() };
}
