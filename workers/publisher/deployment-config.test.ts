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

describe('scheduled production deployment shape', () => {
  test('keeps exactly one five-minute cron and the fixed item-list worker vars in source control', () => {
    expect(config.triggers).toEqual({ crons: ['*/5 * * * *'] });
    expect(config.vars).toMatchObject({
      CAPTURE_BASE_URL: 'https://faction-sheet-asset-publisher.ndelangen.workers.dev',
      CONVEX_EXECUTOR_BASE_URL:
        'https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/executor',
      SUPPORTED_RENDERER_VERSION: 'faction-sheet-v3',
      WORK_WINDOW_MS: '240000',
    });
    expect(config.workers_dev).toBe(true);
    expect(config.preview_urls).toBe(false);
    expect(config.routes).toEqual([{ pattern: 'dune.zone', custom_domain: true }]);
  });

  test('removes queue-era bindings and keeps the cron CPU cap explicit', () => {
    expect(config).not.toHaveProperty('queues');
    expect(config.limits).toEqual({ cpu_ms: 30000 });
    expect(config).not.toHaveProperty('d1_databases');
    expect(config).not.toHaveProperty('kv_namespaces');
    expect(config).not.toHaveProperty('durable_objects');
    expect(config).not.toHaveProperty('migrations');
  });

  test('keeps the stable object behind one private R2 binding', () => {
    expect(config.r2_buckets).toEqual([
      {
        binding: 'ASSET_BUCKET',
        bucket_name: 'tanstack-start-faction-sheet-assets',
      },
    ]);
    const source = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc'),
      'utf8'
    );
    expect(source).not.toContain('r2.dev');
  });

  test('declares only cache-token and executor secret bindings', () => {
    expect(config.secrets).toEqual({
      required: ['ASSET_PUBLISHER_CACHE_TOKEN_SECRET', 'ASSET_PUBLISHER_EXECUTOR_SECRET'],
    });
    const source = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc'),
      'utf8'
    );
    expect(source).not.toContain('ASSET_PUBLISHER_POLL_SECRET');
    expect(source).not.toContain('CONVEX_POLL_URL');
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
    expect(JSON.stringify(config.vars)).not.toMatch(
      /R2_(?:STORAGE|ESTIMATED|INVENTORY|UNACCOUNTED)/
    );
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

  test('documents paused-or-disabled Convex and Queue-free empty-work observation', () => {
    const deploymentGuide = readFileSync(path.resolve(process.cwd(), 'docs/deployment.md'), 'utf8');
    const workerGuide = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/README.md'),
      'utf8'
    );
    for (const guide of [deploymentGuide, workerGuide]) {
      expect(guide).toContain('paused or disabled');
      expect(guide).toContain('*/5 * * * *');
    }
    expect(deploymentGuide).toContain('empty `take-work` result');
    expect(workerGuide).toContain('empty Cron without a Browser Run');
  });

  test('documents the item-claim migration pack and its paused/no-live-claims preconditions', () => {
    const migrationGuide = readFileSync(
      path.resolve(process.cwd(), 'docs/convex-migrations.md'),
      'utf8'
    );
    expect(migrationGuide).toContain('asset_targets_item_claims_v1');
    expect(migrationGuide).toContain('asset_claim_snapshots_retire_v1');
    expect(migrationGuide).toContain('asset_publisher_state_retire_v1');
    expect(migrationGuide).toContain('asset_publisher_admission_counter_retire_v1');
    expect(migrationGuide).toContain('asset_targets_item_claims_verify_v1');
    expect(migrationGuide).toContain('paused');
    expect(migrationGuide).toContain('disabled');
    expect(migrationGuide).toContain('No live item claim may exist');
  });

  test('documents bounded cron telemetry and the queue-free measurement model', () => {
    const measurementGuide = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/MEASUREMENT.md'),
      'utf8'
    );
    expect(measurementGuide).toContain('`*/5 * * * *`');
    expect(measurementGuide).toContain('asset_publisher_cron');
    expect(measurementGuide).toContain('asset_publisher_item_read_error');
    expect(measurementGuide).toContain('8,192');
    expect(measurementGuide).toContain('There is no Queue');
    expect(measurementGuide).toContain('maxItems: 20');
  });
});
