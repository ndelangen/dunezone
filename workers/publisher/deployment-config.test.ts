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
  test('keeps exactly one five-minute cron and no Renderer choice in Worker vars', () => {
    expect(config.triggers).toEqual({ crons: ['*/5 * * * *'] });
    expect(config.vars).toMatchObject({
      CAPTURE_BASE_URL: 'https://faction-sheet-asset-publisher.ndelangen.workers.dev',
      CONVEX_EXECUTOR_BASE_URL:
        'https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/executor',
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
      '/__storybook',
      '/__storybook/',
    ]);
  });

  test('builds the SPA, Storybook, and capture bundle into one validated Worker release unit', () => {
    expect(packageConfig.scripts['publisher:assets']).toContain('bun run app:build');
    expect(packageConfig.scripts['publisher:assets']).toContain('bun run build-storybook');
    expect(packageConfig.scripts['publisher:assets']).toContain(
      'vite build --config workers/publisher/vite.config.ts'
    );
    expect(packageConfig.scripts['publisher:assets']).toContain(
      'scripts/assemble-publisher-assets.ts'
    );
    expect(packageConfig.scripts['publisher:dry-run']).toContain('bun run publisher:assets');
    expect(packageConfig.scripts['publisher:release:verify']).toContain(
      'bun run publisher:dry-run'
    );
    expect(packageConfig.scripts['publisher:release:verify']).toContain(
      'git diff --exit-code -- workers/publisher/renderer-manifest.generated.ts'
    );
  });

  test('runs the complete Linux publisher release verification before merge', () => {
    const verifyWorkflow = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/reusable-verify.yml'),
      'utf8'
    );
    expect(verifyWorkflow).toContain(
      'VITE_CONVEX_URL: https://exuberant-finch-263.eu-west-1.convex.cloud'
    );
    expect(verifyWorkflow).toContain('bun run publisher:release:verify');
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

  test('initializes settings after Convex deploy and activates revisions after Worker smoke', () => {
    const deploymentWorkflow = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/deploy-main.yml'),
      'utf8'
    );
    const convexDeployIndex = deploymentWorkflow.indexOf('name: Deploy Convex');
    const initializeIndex = deploymentWorkflow.indexOf(
      'name: Initialize Publication settings when absent'
    );
    const smokeIndex = deploymentWorkflow.indexOf('name: Smoke scheduled Worker release');
    const activateIndex = deploymentWorkflow.indexOf(
      'name: Activate higher checked-in Renderer revisions'
    );
    expect(convexDeployIndex).toBeGreaterThan(-1);
    expect(initializeIndex).toBeGreaterThan(convexDeployIndex);
    expect(smokeIndex).toBeLessThan(activateIndex);
    expect(deploymentWorkflow).not.toContain('assetPublisherOperator:pause');
    expect(deploymentWorkflow).not.toContain('assetPublisherOperator:activate');
    expect(deploymentWorkflow).not.toContain('SUPPORTED_RENDERER_VERSION');
  });
});
