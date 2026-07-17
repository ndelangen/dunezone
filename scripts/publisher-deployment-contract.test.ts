import { describe, expect, test } from 'vitest';

import {
  APPLICATION_ORIGIN,
  PUBLISHER_ORIGIN,
  PUBLISHER_PRODUCTION_CONVEX_URL,
  PUBLISHER_RENDERER_VERSION,
  PUBLISHER_SUPPORTED_RENDERER_VERSIONS,
  readPublisherConfig,
  validatePublisherDeployContract,
  validatePublisherHealth,
} from './publisher-deployment-contract';

function ciEnvironment(): NodeJS.ProcessEnv {
  return {
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_REF: 'refs/heads/main',
    CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32),
    CLOUDFLARE_API_TOKEN: 'not-a-real-token',
    VITE_CONVEX_URL: PUBLISHER_PRODUCTION_CONVEX_URL,
  };
}

function health() {
  return {
    ok: true,
    maxItems: 20,
    schedule: '*/5 * * * *',
    supportedRendererVersion: PUBLISHER_RENDERER_VERSION,
    rendererSupport: {
      supportedRendererVersions: PUBLISHER_SUPPORTED_RENDERER_VERSIONS,
      rendererId: `faction-sheet/sha256:${'c'.repeat(64)}`,
      configuredRendererVersion: PUBLISHER_RENDERER_VERSION,
      configurationMatchesManifest: true,
    },
    identity: {
      workerVersionTag: 'a'.repeat(40),
      rendererId: `faction-sheet/sha256:${'c'.repeat(64)}`,
      rendererManifestDigest: 'c'.repeat(64),
      configuredRendererVersion: PUBLISHER_RENDERER_VERSION,
      rendererConfigurationMatchesManifest: true,
    },
  };
}

describe('publisher CI deployment contract', () => {
  test('accepts the reviewed scheduled source-controlled configuration', () => {
    expect(() =>
      validatePublisherDeployContract(readPublisherConfig(), ciEnvironment())
    ).not.toThrow();
  });

  test.each([
    ['WORK_WINDOW_MS', '239999'],
    ['PDF_MAX_BYTES', '8000001'],
    ['CONVEX_EXECUTOR_BASE_URL', 'https://replacement.convex.site/asset-publishing/executor'],
  ])('fails closed when %s changes', (name, value) => {
    const config = structuredClone(readPublisherConfig());
    (config.vars as Record<string, unknown>)[name] = value;
    expect(() => validatePublisherDeployContract(config, ciEnvironment())).toThrow();
  });

  test('fails closed when the exact Cron or a resource name changes', () => {
    const cronConfig = structuredClone(readPublisherConfig());
    cronConfig.triggers = { crons: [] };
    expect(() => validatePublisherDeployContract(cronConfig, ciEnvironment())).toThrow();

    const extraCronConfig = structuredClone(readPublisherConfig());
    extraCronConfig.triggers = { crons: ['*/5 * * * *', '0 0 * * *'] };
    expect(() => validatePublisherDeployContract(extraCronConfig, ciEnvironment())).toThrow();

    const bucketConfig = structuredClone(readPublisherConfig());
    (bucketConfig.r2_buckets as Array<Record<string, unknown>>)[0].bucket_name = 'replacement';
    expect(() => validatePublisherDeployContract(bucketConfig, ciEnvironment())).toThrow();
  });

  test('fails closed unless VITE_CONVEX_URL is the exact production deployment', () => {
    expect(() =>
      validatePublisherDeployContract(readPublisherConfig(), {
        ...ciEnvironment(),
        VITE_CONVEX_URL: 'https://example.convex.cloud',
      })
    ).toThrow(/exact production Convex deployment URL/);
  });

  test('accepts health only when the item-list contract, renderer support, origin, and Git SHA match', () => {
    expect(() =>
      validatePublisherHealth(
        readPublisherConfig(),
        health(),
        'a'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'no-store'
      )
    ).not.toThrow();
  });

  test('accepts the exact release on the canonical application origin', () => {
    expect(() =>
      validatePublisherHealth(
        readPublisherConfig(),
        health(),
        'a'.repeat(40),
        `${APPLICATION_ORIGIN}/__asset-publisher/health`,
        'no-store',
        APPLICATION_ORIGIN
      )
    ).not.toThrow();
  });

  test.each([
    ['maxItems', 1],
    ['schedule', '*/15 * * * *'],
  ])('rejects unsafe health field %s', (name, value) => {
    const response = health() as Record<string, unknown>;
    response[name] = value;
    expect(() =>
      validatePublisherHealth(
        readPublisherConfig(),
        response,
        'a'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'no-store'
      )
    ).toThrow();
  });

  test('rejects a renderer mismatch, alternate origin, cached response, or wrong source tag', () => {
    const mismatched = health();
    mismatched.rendererSupport.configurationMatchesManifest = false;
    expect(() =>
      validatePublisherHealth(
        readPublisherConfig(),
        mismatched,
        'a'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'no-store'
      )
    ).toThrow();
    const extraRenderer = health() as unknown as {
      rendererSupport: { supportedRendererVersions: string[] };
    };
    extraRenderer.rendererSupport.supportedRendererVersions = [
      ...PUBLISHER_SUPPORTED_RENDERER_VERSIONS,
      'faction-sheet-v2',
    ];
    expect(() =>
      validatePublisherHealth(
        readPublisherConfig(),
        extraRenderer,
        'a'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'no-store'
      )
    ).toThrow(/renderer support list/);
    expect(() =>
      validatePublisherHealth(
        readPublisherConfig(),
        health(),
        'a'.repeat(40),
        'https://alternate.workers.dev/__asset-publisher/health',
        'no-store'
      )
    ).toThrow();
    expect(() =>
      validatePublisherHealth(
        readPublisherConfig(),
        health(),
        'a'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'public, max-age=60'
      )
    ).toThrow();
    expect(() =>
      validatePublisherHealth(
        readPublisherConfig(),
        health(),
        'd'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'no-store'
      )
    ).toThrow();
  });
});
