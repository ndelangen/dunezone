import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import sharp from 'sharp';
import { expect, test } from 'vitest';

import { socialCardHref } from '../../src/shared/socialCard';

/* Real workerd, R2 and WASM; outbound requests fail so a hidden metadata or font fetch cannot pass. */
test('renders bounded PNGs from local publications with zero outbound requests', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'social-runtime-'));
  let outboundRequests = 0;
  const require = createRequire(import.meta.url);
  const binaryModules: { type: 'CompiledWasm' | 'Data'; path: string; contents: Uint8Array }[] = [];
  const output = await build({
    stdin: {
      contents: `import { handleSocialImageRequest } from './social-image';
        export default { fetch(request, env) { return handleSocialImageRequest(request, env); } };`,
      resolveDir: import.meta.dirname,
      sourcefile: 'social-runtime.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    outdir: directory,
    entryNames: 'index',
    external: ['node:*'],
    plugins: [
      {
        name: 'worker-binary-modules',
        setup(builder) {
          builder.onResolve({ filter: /\.(wasm|woff)$/ }, async (args) => {
            const source = require.resolve(args.path, { paths: [args.resolveDir] });
            const name = path.basename(source);
            binaryModules.push({
              type: source.endsWith('.wasm') ? 'CompiledWasm' : 'Data',
              path: path.join(directory, name),
              contents: await readFile(source),
            });
            return { path: './' + name, external: true };
          });
        },
      },
    ],
  });
  const modules = output.outputFiles.map((file) => ({
    type: file.path.endsWith('.wasm')
      ? ('CompiledWasm' as const)
      : file.path.endsWith('.woff')
        ? ('Data' as const)
        : ('ESModule' as const),
    path: file.path,
    contents: file.contents,
  }));
  modules.push(...binaryModules);
  /* The entry must be first when the module list is explicit. */
  modules.sort((a, b) => Number(b.path.endsWith('index.js')) - Number(a.path.endsWith('index.js')));
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules,
      modulesRoot: directory,
      compatibilityDate: '2026-07-17',
      compatibilityFlags: ['nodejs_compat'],
      r2Buckets: ['ASSET_BUCKET'],
      outboundService: () => {
        outboundRequests += 1;
        return new Response('Unexpected network', { status: 500 });
      },
    })
  );
  try {
    const bucket = await mf.getR2Bucket('ASSET_BUCKET');
    const key = 'faction-tokens/abcdefghijklmnop/token.jpg';
    const artwork = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#ff0000' } })
      .jpeg()
      .toBuffer();
    await bucket.put(key, artwork);
    const input = {
      name: 'Écuyers de Muad’Dib & House Ørnen',
      kind: 'Faction',
      description: '<script>alert("text")</script>',
      image: `/published/${key}`,
      shape: 'round' as const,
    };
    const render = async (href: string) => {
      const response = await mf.dispatchFetch('https://dune.zone' + href);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');
      const png = Buffer.from(await response.arrayBuffer());
      expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 1200, height: 630 });
      return png;
    };
    const original = await render(socialCardHref(input));
    const center = await sharp(original).extract({ left: 930, top: 320, width: 1, height: 1 }).raw().toBuffer();
    expect(center[0]).toBeGreaterThan(240);
    expect(center[1]).toBeLessThan(10);
    expect(center[2]).toBeLessThan(10);
    expect(center[3]).toBe(255);
    const newerArtwork = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#0000ff' } })
      .jpeg()
      .toBuffer();
    await bucket.put(key, newerArtwork);
    expect(await render(socialCardHref(input))).not.toEqual(original);
    await bucket.put(key, artwork);

    expect(await render(socialCardHref({ ...input, name: 'Different name' }))).not.toEqual(original);
    await bucket.delete(key);
    const missing = await render(socialCardHref(input));
    expect(missing).not.toEqual(original);
    await bucket.put(key, artwork);
    expect(await render(socialCardHref(input))).toEqual(original);
    for (const shape of ['round', 'portrait', 'landscape'] as const) {
      await render(
        socialCardHref({ ...input, shape, name: 'A long name '.repeat(15), description: 'Long excerpt '.repeat(25) })
      );
    }
    expect(outboundRequests).toBe(0);
  } finally {
    await mf.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
