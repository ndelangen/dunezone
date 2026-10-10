import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test, vi } from 'vitest';

import worker, { isMediaPath } from './index';

const config = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'workers/storybook/wrangler.jsonc'), 'utf8')
) as Record<string, unknown>;

describe('public Storybook deployment', () => {
  test('owns only the isolated Storybook hostname', () => {
    expect(config.name).toBe('dune-zone-storybook');
    expect(config.routes).toEqual([{ pattern: 'storybook.dune.zone', custom_domain: true }]);
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
  });

  test('is a secret-free Static Assets deployment whose code only forwards rasters', () => {
    expect(config.main).toBe('./index.ts');
    expect(config).not.toHaveProperty('vars');
    expect(config).not.toHaveProperty('secrets');
    expect(config).not.toHaveProperty('r2_buckets');
    expect(config).not.toHaveProperty('services');
    expect(config).not.toHaveProperty('browser');
    expect(config).not.toHaveProperty('images');
    expect(config.assets).toEqual({
      directory: '../../storybook-static',
      binding: 'ASSETS',
      html_handling: 'none',
      not_found_handling: '404-page',
      run_worker_first: ['/m/*', '/image/*', '/web/*'],
    });
  });

  test('leaves out of the upload exactly the prefixes the Worker forwards', () => {
    const ignored = readFileSync(path.resolve(process.cwd(), '.storybook/static/.assetsignore'), 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'));
    expect(ignored).toEqual(['/m', '/image', '/web']);
  });

  test('forwards only raster prefixes to the application origin', async () => {
    const assets = { fetch: vi.fn(async () => new Response('asset')) };
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('raster'));
    try {
      expect(isMediaPath('/m/a.b.jpg')).toBe(true);
      expect(isMediaPath('/image/texture/054.jpg')).toBe(true);
      expect(isMediaPath('/web/logo.svg')).toBe(true);
      expect(isMediaPath('/iframe.html')).toBe(false);
      expect(isMediaPath('/media/x')).toBe(false);

      await worker.fetch(new Request('https://storybook.dune.zone/image/texture/054.jpg?v=1'), { ASSETS: assets });
      expect(upstream).toHaveBeenCalledWith('https://dune.zone/image/texture/054.jpg?v=1', { method: 'GET' });

      expect(
        await (await worker.fetch(new Request('https://storybook.dune.zone/index.json'), { ASSETS: assets })).text()
      ).toBe('asset');
      const put = await worker.fetch(new Request('https://storybook.dune.zone/m/x', { method: 'PUT', body: 'x' }), {
        ASSETS: assets,
      });
      expect(put.status).toBe(405);
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      upstream.mockRestore();
    }
  });
});
