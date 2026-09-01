import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

const config = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc'), 'utf8')
) as Record<string, unknown>;

describe('scheduled production deployment shape', () => {
  test('keeps exactly one five-minute cron and no Renderer choice in Worker vars', () => {
    expect(config.triggers).toEqual({ crons: ['*/5 * * * *'] });
    expect(config.vars).toMatchObject({
      PUBLIC_BASE_URL: 'https://dune.zone',
      CAPTURE_BASE_URL: 'https://faction-sheet-asset-publisher.ndelangen.workers.dev',
      CONVEX_EXECUTOR_BASE_URL: 'https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/executor',
      GIT_SHA: 'development',
      WORK_WINDOW_MS: '240000',
    });
    expect(config.vars).not.toHaveProperty('SUPPORTED_RENDERER_VERSION');
    expect(config.workers_dev).toBe(true);
    expect(config.preview_urls).toBe(false);
    expect(config.routes).toEqual([{ pattern: 'dune.zone', custom_domain: true }]);
  });

  test('removes queue-era bindings and keeps the cron CPU cap explicit', () => {
    expect(config).not.toHaveProperty('queues');
    expect(config.limits).toEqual({ cpu_ms: 30_000 });
    expect(config).not.toHaveProperty('d1_databases');
    expect(config).not.toHaveProperty('kv_namespaces');
    expect(config).not.toHaveProperty('durable_objects');
    expect(config).not.toHaveProperty('migrations');
  });

  test('keeps the two private R2 bindings, one per audience', () => {
    expect(config.r2_buckets).toEqual([
      {
        binding: 'ASSET_BUCKET',
        bucket_name: 'tanstack-start-faction-sheet-assets',
      },
      {
        binding: 'USER_IMAGE_BUCKET',
        bucket_name: 'dunezone-user-images',
      },
    ]);
  });

  test('loads the shared renderer stylesheet and font files as Worker modules', () => {
    expect(config.rules).toEqual([
      { type: 'Text', globs: ['**/*.css'], fallthrough: true },
      { type: 'Data', globs: ['**/*.woff2'], fallthrough: true },
    ]);
    expect(config.alias).toEqual({
      'rulebook-html-renderer-runtime': './runtime-generated/rulebook-html-renderer.mjs',
    });
  });

  test('declares only the cache-token and executor secrets', () => {
    expect(config.secrets).toEqual({
      required: ['ASSET_PUBLISHER_CACHE_TOKEN_SECRET', 'ASSET_PUBLISHER_EXECUTOR_SECRET'],
    });
  });

  test('binds exact Worker version metadata for telemetry identity', () => {
    expect(config.version_metadata).toEqual({ binding: 'CF_VERSION_METADATA' });
  });

  test('keeps the work-window and PDF bounds explicit', () => {
    expect(config.vars).toMatchObject({
      WORK_WINDOW_MS: '240000',
      PDF_MAX_BYTES: '8000000',
      BROWSER_CAPTURE_TIMEOUT_MS: '45000',
      BROWSER_CLEANUP_GRACE_MS: '15000',
    });
    expect(JSON.stringify(config.vars)).not.toContain('EXECUTOR_MAX_ITEMS');
    expect(JSON.stringify(config.vars)).not.toMatch(/R2_(?:STORAGE|ESTIMATED|INVENTORY|UNACCOUNTED)/);
  });

  test('keeps assets first except for the reviewed Worker-owned entry paths', () => {
    expect(config.assets).toMatchObject({
      directory: './dist',
      binding: 'ASSETS',
      html_handling: 'none',
      not_found_handling: 'single-page-application',
    });
    expect((config.assets as { run_worker_first?: string[] }).run_worker_first).toEqual([
      '/__asset-publisher',
      '/__asset-publisher/*',
      '/published',
      '/published/*',
      '/publisher-capture',
      '/publisher-capture.html',
      '/publisher-capture/*',
      '/user-images',
      '/user-images/*',
      '/__user-images',
      '/__user-images/*',
    ]);
  });
});
