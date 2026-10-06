import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import sharp from 'sharp';
import { expect, test } from 'vitest';

import { socialCardHref } from '../../src/shared/socialCard';
import { jpegBytes } from './test-helpers';

/* Real workerd, R2 and WASM; outbound requests fail so a hidden metadata or font fetch cannot pass. */
test('renders bounded PNGs from local publications with zero outbound requests', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'social-runtime-'));
  let outboundRequests = 0;
  const require = createRequire(import.meta.url);
  const binaryModules: { type: 'CompiledWasm' | 'Data'; path: string; contents: Uint8Array }[] = [];
  const output = await build({
    stdin: {
      contents: `import { handleSocialImageRequest } from './social-image';
        export default { fetch(request, env) { return handleSocialImageRequest(request, env, undefined,
          request.headers.has('X-Test-Cache') ? { storage: caches.default, release: 'runtime' } : undefined); } };`,
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
      r2Buckets: ['ASSET_BUCKET', 'USER_IMAGE_BUCKET'],
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
    const cover = await sharp({ create: { width: 840, height: 1188, channels: 3, background: '#ff0000' } })
      .jpeg()
      .toBuffer();
    const coverKey = 'rulebooks/abcdefghijklmnop/first-page.jpg';
    await bucket.put(coverKey, cover);
    const userImages = await mf.getR2Bucket('USER_IMAGE_BUCKET');
    const userKey = 'a'.repeat(64) + '.jpg';
    await userImages.put(userKey, cover);
    for (const image of [`/published/${coverKey}`, `/user-images/${userKey}`]) {
      const png = await render(
        socialCardHref({ name: 'Dream Rulebook', kind: 'Rulebook', description: 'Dreamrules. Edition 2.', image })
      );
      const pixel = await sharp(png)
        .extract({ left: 920, top: 300, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      expect(pixel[0]).toBeGreaterThan(240);
      expect(pixel[1]).toBeLessThan(15);
    }
    const original = await render(socialCardHref(input));
    const cachedFetch = (href: string) =>
      mf.dispatchFetch('https://dune.zone' + href, { headers: { 'X-Test-Cache': '1' } });
    const cold = await cachedFetch(socialCardHref(input));
    expect(cold.headers.get('X-Public-Cache')).toBe('miss');
    expect(cold.headers.get('X-Public-Artwork-Reads')).toBe('1');
    expect(Buffer.from(await cold.arrayBuffer())).toEqual(original);
    await bucket.delete(key);
    const hit = await cachedFetch(socialCardHref(input));
    expect(hit.headers.get('X-Public-Cache')).toBe('hit');
    expect(hit.headers.get('X-Public-Renders')).toBe('0');
    expect(hit.headers.get('X-Public-Artwork-Reads')).toBe('0');
    expect(Buffer.from(await hit.arrayBuffer())).toEqual(original);
    const newWords = await cachedFetch(socialCardHref({ ...input, name: 'Other words' }));
    expect(newWords.headers.get('X-Public-Cache')).toBe('miss');
    expect(newWords.headers.get('X-Public-Artwork-Cache')).toBe('hit');
    expect(newWords.headers.get('X-Public-Artwork-Reads')).toBe('0');
    await newWords.arrayBuffer();
    await bucket.put(key, artwork);
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
    /* A plausible header can still fail inside Satori or decode to transparent pixels in resvg. */
    await bucket.put(key, jpegBytes({ widthPx: 600, heightPx: 600, progressive: true }));
    expect(await render(socialCardHref(input))).toEqual(missing);
    const sof = artwork.indexOf(Buffer.from([0xff, 0xc0]));
    expect(sof).toBeGreaterThan(0);
    await bucket.put(key, artwork.subarray(0, sof + 2 + artwork.readUInt16BE(sof + 2)));
    const unreadable = await render(socialCardHref(input));
    const fallbackRegion = { left: 850, top: 250, width: 150, height: 150 };
    expect(await sharp(unreadable).extract(fallbackRegion).raw().toBuffer()).toEqual(
      await sharp(missing).extract(fallbackRegion).raw().toBuffer()
    );
    await bucket.put(key, artwork);
    expect(await render(socialCardHref(input))).toEqual(original);
    /* Distinct, valid JPEGs near the byte bound exercise repeated requests in one isolate. */
    const comment = Buffer.alloc(60_004, 32);
    comment.set([0xff, 0xfe, 0xea, 0x62]);
    const largeArtwork = Buffer.concat([
      artwork.subarray(0, 2),
      ...Array<Buffer>(30).fill(comment),
      artwork.subarray(2),
    ]);
    expect(largeArtwork.byteLength).toBeGreaterThan(1_800_000);
    expect(largeArtwork.byteLength).toBeLessThan(2_000_000);
    for (let revision = 0; revision < 60; revision += 1) {
      largeArtwork[6] = revision;
      await bucket.put(key, largeArtwork);
      expect(await render(socialCardHref(input))).toEqual(original);
    }
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
}, 60_000);
