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
      SUPPORTED_RENDERER_VERSION: 'faction-sheet-v4',
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

  test('checks the Linux production renderer manifest before merge', () => {
    const verifyWorkflow = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/reusable-verify.yml'),
      'utf8'
    );
    expect(verifyWorkflow).toContain(
      'VITE_CONVEX_URL: https://exuberant-finch-263.eu-west-1.convex.cloud'
    );
    expect(verifyWorkflow).toContain(
      'git diff --exit-code -- workers/publisher/renderer-manifest.generated.ts'
    );
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

  test('fails closed by pausing before deploy and activating only after Worker smoke', () => {
    const deploymentGuide = readFileSync(path.resolve(process.cwd(), 'docs/deployment.md'), 'utf8');
    const workerGuide = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/README.md'),
      'utf8'
    );
    const deploymentWorkflow = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/deploy-main.yml'),
      'utf8'
    );
    for (const guide of [deploymentGuide, workerGuide]) {
      expect(guide).toContain('leaves');
      expect(guide).toContain('paused');
      expect(guide).toContain('*/5 * * * *');
    }
    const statusReadIndex = deploymentWorkflow.indexOf('convex data asset_type_configs');
    const pauseIndex = deploymentWorkflow.indexOf('assetPublisherOperator:pause');
    const convexDeployIndex = deploymentWorkflow.indexOf('name: Deploy Convex');
    const smokeIndex = deploymentWorkflow.indexOf('name: Smoke scheduled Worker release');
    const activateIndex = deploymentWorkflow.indexOf('assetPublisherOperator:activate');
    expect(statusReadIndex).toBeGreaterThan(-1);
    expect(statusReadIndex).toBeLessThan(pauseIndex);
    expect(pauseIndex).toBeGreaterThan(-1);
    expect(pauseIndex).toBeLessThan(convexDeployIndex);
    expect(smokeIndex).toBeLessThan(activateIndex);
    expect(deploymentWorkflow).toContain('paused|disabled)');
    expect(deploymentWorkflow).toContain('reactivate=false');
    expect(deploymentWorkflow).toContain("steps.publisher_quiesce.outputs.reactivate == 'true'");
    expect(deploymentWorkflow).toContain('.status == "paused"');
    expect(deploymentWorkflow).toContain('.status == "active" and .rendererVersion == $renderer');
  });
});
