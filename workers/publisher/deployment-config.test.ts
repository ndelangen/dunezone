import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

const config = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc'), 'utf8')
) as Record<string, unknown>;
const packageConfig = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
) as { scripts: Record<string, string> };

describe('disabled production deployment shape', () => {
  test('is inert and unprovisioned by default', () => {
    expect(config.triggers).toEqual({ crons: [] });
    expect(config.vars).toMatchObject({
      PUBLISHER_ENABLED: 'false',
      CRON_DISPATCH_ENABLED: 'false',
      CAPTURE_BASE_URL: 'https://publisher.invalid',
      R2_INVENTORY_OBSERVED_AT_MS: '0',
      EXECUTOR_MAX_ITEMS: '1',
    });
    expect(config.workers_dev).toBe(false);
  });

  test('uses one bounded Queue consumer and no alternate authority', () => {
    expect(config.queues).toEqual({
      producers: [{ binding: 'PUBLISH_QUEUE', queue: 'faction-sheet-publisher-unprovisioned' }],
      consumers: [
        {
          queue: 'faction-sheet-publisher-unprovisioned',
          max_batch_size: 1,
          max_batch_timeout: 1,
          max_retries: 2,
          max_concurrency: 1,
        },
      ],
    });
    expect(config).not.toHaveProperty('d1_databases');
    expect(config).not.toHaveProperty('kv_namespaces');
    expect(config).not.toHaveProperty('durable_objects');
    expect(config).not.toHaveProperty('migrations');
    expect(config).not.toHaveProperty('limits');
  });

  test('keeps the stable object behind one private R2 binding', () => {
    expect(config.r2_buckets).toEqual([
      {
        binding: 'ASSET_BUCKET',
        bucket_name: 'faction-sheet-assets-unprovisioned',
      },
    ]);
    const source = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc'),
      'utf8'
    );
    expect(source).not.toContain('r2.dev');
    expect(config).not.toHaveProperty('routes');
  });

  test('declares cache-token plus separate generated poll/executor secret bindings', () => {
    expect(config.secrets).toEqual({
      required: [
        'ASSET_PUBLISHER_CACHE_TOKEN_SECRET',
        'ASSET_PUBLISHER_POLL_SECRET',
        'ASSET_PUBLISHER_EXECUTOR_SECRET',
      ],
    });
    const source = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc'),
      'utf8'
    );
    expect(source).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{16}/);
  });

  test('keeps the decimal 8 GB guard and exact timing contract explicit', () => {
    expect(config.vars).toMatchObject({
      SOFT_DEADLINE_MS: '480000',
      UPLOAD_MARGIN_MS: '120000',
      R2_STORAGE_CEILING_BYTES: '8000000000',
      R2_UNACCOUNTED_WRITE_BUDGET_BYTES: '200000000',
      PDF_MAX_BYTES: '2000000',
      BROWSER_CAPTURE_TIMEOUT_MS: '45000',
      BROWSER_CLEANUP_GRACE_MS: '15000',
    });
  });

  test('keeps the SPA asset-first and reserves only published, capture, and operational paths', () => {
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
    ]);
    expect(JSON.stringify(config.assets)).not.toContain('"/factions');
  });

  test('builds the SPA and capture bundle into one validated Worker release unit', () => {
    expect(packageConfig.scripts['publisher:assets']).toContain('bun run app:build');
    expect(packageConfig.scripts['publisher:assets']).toContain(
      'vite build --config workers/publisher/vite.config.ts'
    );
    expect(packageConfig.scripts['publisher:assets']).toContain(
      'scripts/assemble-publisher-assets.ts'
    );
    expect(packageConfig.scripts['publisher:dry-run']).toContain('bun run publisher:assets');
  });

  test('ignores publisher secret files while retaining the tracked example', () => {
    const ignored = spawnSync('git', ['check-ignore', 'workers/publisher/.dev.vars.production'], {
      encoding: 'utf8',
    });
    const example = spawnSync('git', ['check-ignore', 'workers/publisher/.dev.vars.example'], {
      encoding: 'utf8',
    });
    expect(ignored.status).toBe(0);
    expect(example.status).toBe(1);
  });

  test('excludes only the generated Wrangler declaration from Biome drift checks', () => {
    const biome = JSON.parse(readFileSync(path.resolve(process.cwd(), 'biome.json'), 'utf8')) as {
      files: { includes: string[] };
    };
    expect(biome.files.includes).toContain('!**/workers/publisher/worker-configuration.d.ts');
  });
});
