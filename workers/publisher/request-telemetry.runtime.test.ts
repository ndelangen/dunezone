import path from 'node:path';

import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, test } from 'vite-plus/test';

test('request telemetry preserves real workerd streams and WebSocket upgrades', async () => {
  const bundle = await build({
    stdin: {
      contents: `import { observePublisherRequest } from './request-telemetry';
        export default { async fetch(request) {
          const identity = { GIT_SHA: 'test', CF_VERSION_METADATA: { id: 'test' } };
          Math.random = () => 0;
          let response;
          if (request.headers.get('Upgrade') === 'websocket') {
            const pair = new WebSocketPair();
            pair[1].accept();
            pair[1].addEventListener('message', event => pair[1].send(event.data));
            pair[1].addEventListener('close', () => pair[1].close());
            response = new Response(null, { status: 101, webSocket: pair[0] });
          } else {
            response = new Response(new Blob(['streamed document']).stream(), { headers: { ETag: 'original' } });
          }
          const observed = await observePublisherRequest(request, identity, async () => response);
          if (observed !== response || observed.bodyUsed) throw new Error('Response was changed');
          return observed;
        } };`,
      resolveDir: import.meta.dirname,
      sourcefile: 'request-telemetry-runtime.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: [
        {
          type: 'ESModule',
          path: path.join(import.meta.dirname, 'request-telemetry-runtime.js'),
          contents: bundle.outputFiles[0]!.text,
        },
      ],
      compatibilityDate: '2026-07-17',
      compatibilityFlags: ['nodejs_compat'],
    })
  );
  try {
    const response = await mf.dispatchFetch('https://dune.zone/published/test');
    expect(response.headers.get('ETag')).toBe('original');
    expect(await response.text()).toBe('streamed document');
    const upgrade = await mf.dispatchFetch('https://dune.zone/__play/test/socket', {
      headers: { Upgrade: 'websocket' },
    });
    expect(upgrade.status).toBe(101);
    const socket = upgrade.webSocket!;
    socket.accept();
    const message = new Promise((resolve) =>
      socket.addEventListener('message', (event) => resolve(event.data), { once: true })
    );
    socket.send('still connected');
    expect(await message).toBe('still connected');
    socket.close();
  } finally {
    await mf.dispose();
  }
}, 20_000);
