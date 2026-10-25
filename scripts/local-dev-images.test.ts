import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type * as MiniflareModule from 'miniflare';
import sharp from 'sharp';
import { expect, test } from 'vite-plus/test';

const wranglerRequire = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare') as typeof MiniflareModule;

test('the Wrangler-resolved Images encoder preserves fit, progressive JPEG and requested quality', async () => {
  expect(wranglerRequire('miniflare/package.json').version).toBe('5.20261006.1-alpha');
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-07-17',
      images: { binding: 'IMAGES' },
      script: `export default { async fetch(request, env) { const quality = Number(new URL(request.url).searchParams.get('quality')); return (await env.IMAGES.input(request.body).transform({width: 80, height: 60, fit: 'cover'}).output({format: 'image/jpeg', quality})).response(); } }`,
    })
  );
  try {
    const png = await sharp(randomBytes(180 * 120 * 3), { raw: { width: 180, height: 120, channels: 3 } })
      .png()
      .toBuffer();
    const results: Buffer[] = [];
    for (const quality of [20, 82, 95]) {
      const response = await runtime.dispatchFetch(`http://localhost/?quality=${quality}`, {
        method: 'POST',
        body: png,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
      const bytes = Buffer.from(await response.arrayBuffer());
      results.push(bytes);
      expect(await sharp(bytes).metadata()).toMatchObject({ width: 80, height: 60, isProgressive: true });
    }
    expect(results[0]!.length).toBeLessThan(results[1]!.length);
    expect(results[1]!.length).toBeLessThan(results[2]!.length);
  } finally {
    await runtime.dispose();
  }
}, 30_000);

test('R2 objects survive runtime restart and remain isolated by persistent directory', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'local-r2-'));
  const start = (name: string) =>
    new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: '2026-07-17',
        resourcePersistencePath: path.join(directory, name),
        r2Buckets: { OBJECTS: 'local-review' },
        script: `export default { async fetch(request, env) { if(request.method === 'PUT') { await env.OBJECTS.put('marker', request.body); return new Response('saved'); } const object = await env.OBJECTS.get('marker'); return new Response(object?.body ?? null, {status: object ? 200 : 404}); } }`,
      })
    );
  let first = start('a');
  const second = start('b');
  try {
    expect(
      (await first.dispatchFetch('http://localhost/', { method: 'PUT', body: 'persistent-artifact' })).status
    ).toBe(200);
    await first.dispose();
    first = start('a');
    expect(await (await first.dispatchFetch('http://localhost/')).text()).toBe('persistent-artifact');
    expect((await second.dispatchFetch('http://localhost/')).status).toBe(404);
  } finally {
    await first.dispose();
    await second.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
