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
  test('keeps exactly one five-minute Cron and active Worker flags in source control', () => {
    expect(config.triggers).toEqual({ crons: ['*/5 * * * *'] });
    expect(config.vars).toMatchObject({
      PUBLISHER_ENABLED: 'true',
      CRON_DISPATCH_ENABLED: 'true',
      CAPTURE_BASE_URL: 'https://faction-sheet-asset-publisher.ndelangen.workers.dev',
      SUPPORTED_RENDERER_VERSION: 'faction-sheet-v3',
    });
    expect(config.workers_dev).toBe(true);
    expect(config.preview_urls).toBe(false);
  });

  test('uses direct scheduled execution and no alternate authority', () => {
    expect(config).not.toHaveProperty('queues');
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
        bucket_name: 'tanstack-start-faction-sheet-assets',
      },
    ]);
    const source = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc'),
      'utf8'
    );
    expect(source).not.toContain('r2.dev');
    expect(config).not.toHaveProperty('routes');
  });

  test('declares only cache-token and executor secret bindings', () => {
    expect(config.secrets).toEqual({
      required: ['ASSET_PUBLISHER_CACHE_TOKEN_SECRET', 'ASSET_PUBLISHER_EXECUTOR_SECRET'],
    });
    const source = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc'),
      'utf8'
    );
    expect(source).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{16}/);
  });

  test('binds exact Worker version metadata for telemetry identity', () => {
    expect(config.version_metadata).toEqual({ binding: 'CF_VERSION_METADATA' });
  });

  test('keeps the exact PDF storage bound and timing contract explicit', () => {
    expect(config.vars).toMatchObject({
      SOFT_DEADLINE_MS: '240000',
      UPLOAD_MARGIN_MS: '120000',
      PDF_MAX_BYTES: '8000000',
      BROWSER_CAPTURE_TIMEOUT_MS: '45000',
      BROWSER_CLEANUP_GRACE_MS: '15000',
    });
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
    const assemblySource = readFileSync(
      path.resolve(process.cwd(), 'scripts/assemble-publisher-assets.ts'),
      'utf8'
    );
    expect(assemblySource).toContain('assemblePublisherAssets(appDirectory, publisherDirectory)');
    expect(assemblySource).toContain('writeRendererManifest(repositoryRoot, publisherDirectory)');
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

  test('keeps the main deploy ordered, scheduled, source-exact, and Netlify-last', () => {
    const workflow = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/deploy-main.yml'),
      'utf8'
    );
    const orderedSteps = [
      'Deploy Convex',
      'Run and verify required migrations',
      'Preflight exact scheduled Worker release',
      'Check generated Worker types',
      'Typecheck Worker release',
      'Build unified Worker release',
      'Verify assembled Worker assets',
      'Verify release build kept merged source exact',
      'Dry-run exact Worker release',
      'Deploy exact Worker release',
      'Smoke scheduled Worker release',
      'Deploy rollback build to Netlify',
    ];
    let previous = -1;
    for (const step of orderedSteps) {
      const position = workflow.indexOf(`name: ${step}`);
      expect(position, `${step} must exist after the prior release gate`).toBeGreaterThan(previous);
      previous = position;
    }
    expect(workflow).toContain('CLOUDFLARE_API_TOKEN: $' + '{{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(workflow).toContain('CLOUDFLARE_ACCOUNT_ID: $' + '{{ vars.CLOUDFLARE_ACCOUNT_ID }}');
    expect(workflow).toContain('VITE_CONVEX_URL: $' + '{{ secrets.VITE_CONVEX_URL }}');
    expect(workflow).toContain('--strict');
    expect(workflow).toContain('--tag "$GITHUB_SHA"');
    expect(workflow).not.toContain('--keep-vars');
    expect(workflow).not.toContain('--triggers');
    expect(workflow).not.toContain('--secrets-file');
    expect(workflow).not.toContain('name: Generate app artifacts');
    expect(workflow).not.toContain('/asset-publishing/operator');
    expect(workflow).not.toContain('assetPublisherOperator');
    expect(workflow).not.toContain('requeueCurrentFactionSheetCanary');
    expect(workflow).not.toMatch(/wrangler queues[^\n]*send/);
  });

  test('documents the paused Convex prerequisite outside the non-mutating deploy workflow', () => {
    const deploymentGuide = readFileSync(path.resolve(process.cwd(), 'docs/deployment.md'), 'utf8');
    const workerGuide = readFileSync(
      path.resolve(process.cwd(), 'workers/publisher/README.md'),
      'utf8'
    );
    const prerequisite =
      'Convex publisher config and singleton must both be paused before this scheduled Worker release is merged or deployed.';
    expect(deploymentGuide.replace(/\s+/g, ' ')).toContain(prerequisite);
    expect(workerGuide.replace(/\s+/g, ' ')).toContain(prerequisite);
    expect(deploymentGuide).toContain('result: "empty"');
    expect(deploymentGuide).toContain('Keep Convex paused until the separate operator activation');
  });
});
