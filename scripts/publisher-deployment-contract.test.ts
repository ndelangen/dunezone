import { describe, expect, test } from 'vitest';

import { rendererManifest } from '../workers/publisher/renderer-manifest.generated';
import {
  APPLICATION_ORIGIN,
  PUBLISHER_ORIGIN,
  PUBLISHER_PRODUCTION_CONVEX_URL,
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
    rendererIdentity: rendererManifest.rendererIdentity,
    identity: {
      workerVersionTag: 'a'.repeat(40),
      gitSha: 'a'.repeat(40),
      rendererIdentity: rendererManifest.rendererIdentity,
      rendererManifestDigest: rendererManifest.digest,
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

  test.each([
    PUBLISHER_ORIGIN,
    APPLICATION_ORIGIN,
  ])('accepts current Renderer health at %s', (origin) => {
    expect(() =>
      validatePublisherHealth(
        health(),
        'a'.repeat(40),
        `${origin}/__asset-publisher/health`,
        'no-store',
        origin
      )
    ).not.toThrow();
  });

  test.each([
    ['maxItems', 1],
    ['schedule', '*/15 * * * *'],
    ['rendererIdentity', `faction-sheet/sha256:${'c'.repeat(64)}`],
  ])('rejects mismatched health field %s', (name, value) => {
    const response = health() as Record<string, unknown>;
    response[name] = value;
    expect(() =>
      validatePublisherHealth(
        response,
        'a'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'no-store'
      )
    ).toThrow();
  });

  test('rejects alternate origins, cached responses, and wrong source tags', () => {
    expect(() =>
      validatePublisherHealth(
        health(),
        'a'.repeat(40),
        'https://alternate.workers.dev/__asset-publisher/health',
        'no-store'
      )
    ).toThrow();
    expect(() =>
      validatePublisherHealth(
        health(),
        'a'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'public, max-age=60'
      )
    ).toThrow();
    expect(() =>
      validatePublisherHealth(
        health(),
        'd'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'no-store'
      )
    ).toThrow();
  });
});
