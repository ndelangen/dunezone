import { describe, expect, test } from 'vitest';

import { createCacheSigningSecret } from '../../convex/lib/assetPublisherHttp';
import { parsePublisherConfig } from './config';
import { rendererManifest } from './renderer-manifest.generated';

function env(overrides: Record<string, string> = {}): Env {
  return {
    ASSET_PUBLISHER_EXECUTOR_SECRET: 'executor-secret',
    ASSET_PUBLISHER_CACHE_TOKEN_SECRET: createCacheSigningSecret(),
    CAPTURE_BASE_URL: 'https://publisher.example.com',
    CONVEX_EXECUTOR_BASE_URL: 'https://convex.example.com/executor',
    CONVEX_RENDER_URL: 'https://convex.example.com/render',
    SUPPORTED_RENDERER_VERSION: rendererManifest.rendererVersion,
    WORK_WINDOW_MS: '240000',
    BROWSER_CAPTURE_TIMEOUT_MS: '45000',
    BROWSER_CLEANUP_GRACE_MS: '15000',
    PDF_MAX_BYTES: '8000000',
    ...overrides,
  } as unknown as Env;
}

describe('publisher lifecycle configuration', () => {
  test('accepts the five-minute cron work-window contract', () => {
    const config = parsePublisherConfig(env());
    expect(config).toMatchObject({
      workWindowMs: 240_000,
      browserCaptureTimeoutMs: 45_000,
      browserCleanupGraceMs: 15_000,
    });
    expect(
      config.browserCaptureTimeoutMs + config.browserCleanupGraceMs + 5_000
    ).toBeLessThanOrEqual(config.workWindowMs);
    expect(config.supportedRendererVersions).toEqual(['faction-sheet-v4']);
  });

  test('still validates the capture route upstream without projecting it into executor config', () => {
    expect(() => parsePublisherConfig(env({ CONVEX_RENDER_URL: 'not-a-url' }))).toThrow();
  });

  test('rejects phase settings that exceed the four-minute work window', () => {
    expect(() =>
      parsePublisherConfig(
        env({ BROWSER_CAPTURE_TIMEOUT_MS: '225001', BROWSER_CLEANUP_GRACE_MS: '10000' })
      )
    ).toThrow(/absolute executor lifecycle deadline/);
  });

  test.each([
    rendererManifest.rendererId,
    'mutable-renderer-alias',
  ])('rejects unsupported renderer version %s', (rendererVersion) => {
    expect(() =>
      parsePublisherConfig(env({ SUPPORTED_RENDERER_VERSION: rendererVersion }))
    ).toThrow(/embedded renderer compatibility version/);
  });

  test('requires distinct executor and cache-token secrets', () => {
    const secret = createCacheSigningSecret();
    expect(() =>
      parsePublisherConfig(
        env({
          ASSET_PUBLISHER_CACHE_TOKEN_SECRET: secret,
          ASSET_PUBLISHER_EXECUTOR_SECRET: secret,
        })
      )
    ).toThrow(/must be distinct/);
  });

  test('rejects missing or malformed cache-token signing secrets before taking work', () => {
    expect(() => parsePublisherConfig(env({ ASSET_PUBLISHER_CACHE_TOKEN_SECRET: '' }))).toThrow(
      /canonical 256-bit secret/
    );
    expect(() =>
      parsePublisherConfig(env({ ASSET_PUBLISHER_CACHE_TOKEN_SECRET: 'not-a-signing-secret' }))
    ).toThrow(/canonical 256-bit secret/);
  });

  test('keeps the structural PDF cap at 8,000,000 bytes', () => {
    expect(parsePublisherConfig(env()).pdfMaxBytes).toBe(8_000_000);
    expect(() => parsePublisherConfig(env({ PDF_MAX_BYTES: '8000001' }))).toThrow(
      'PDF_MAX_BYTES must be between 8000000 and 8000000'
    );
  });
});
