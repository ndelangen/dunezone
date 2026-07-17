import { describe, expect, test } from 'vitest';

import { parsePublisherConfig } from './config';
import { rendererManifest } from './renderer-manifest.generated';

function env(overrides: Record<string, string> = {}): Env {
  return {
    ASSET_PUBLISHER_POLL_SECRET: 'poll-secret',
    ASSET_PUBLISHER_EXECUTOR_SECRET: 'executor-secret',
    CAPTURE_BASE_URL: 'https://publisher.example.com',
    CONVEX_POLL_URL: 'https://convex.example.com/poll',
    CONVEX_EXECUTOR_BASE_URL: 'https://convex.example.com/executor',
    CONVEX_RENDER_URL: 'https://convex.example.com/render',
    SUPPORTED_RENDERER_VERSION: rendererManifest.rendererVersion,
    EXECUTOR_MAX_ITEMS: '1',
    SOFT_DEADLINE_MS: '240000',
    UPLOAD_MARGIN_MS: '120000',
    BROWSER_CAPTURE_TIMEOUT_MS: '45000',
    BROWSER_CLEANUP_GRACE_MS: '15000',
    PDF_MAX_BYTES: '8000000',
    QUEUE_MAX_PRE_OWNERSHIP_ATTEMPTS: '2',
    QUEUE_RETRY_DELAY_SECONDS: '60',
    ...overrides,
  } as unknown as Env;
}

describe('publisher lifecycle configuration', () => {
  test('accepts the inert production timing contract', () => {
    const config = parsePublisherConfig(env());
    expect(config).toMatchObject({
      softDeadlineMs: 240_000,
      browserCaptureTimeoutMs: 45_000,
      browserCleanupGraceMs: 15_000,
    });
    expect(
      config.browserCaptureTimeoutMs + config.browserCleanupGraceMs + 5_000
    ).toBeLessThanOrEqual(config.softDeadlineMs);
    expect(config.softDeadlineMs - config.uploadMarginMs).toBe(120_000);
    expect(config.supportedRendererVersion).toBe('faction-sheet-v2');
    expect(config.supportedRendererVersions).toEqual(['faction-sheet-v1', 'faction-sheet-v2']);
  });

  test('allows only the measured one- and two-item executor candidates', () => {
    expect(parsePublisherConfig(env({ EXECUTOR_MAX_ITEMS: '1' })).maxItems).toBe(1);
    expect(parsePublisherConfig(env({ EXECUTOR_MAX_ITEMS: '2' })).maxItems).toBe(2);
    expect(() => parsePublisherConfig(env({ EXECUTOR_MAX_ITEMS: '3' }))).toThrow(
      'EXECUTOR_MAX_ITEMS must be between 1 and 2'
    );
  });

  test('rejects phase settings that could consume the cleanup and settlement margin', () => {
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

  test('keeps the structural storage proof at the exact 8,000,000-byte PDF cap', () => {
    expect(parsePublisherConfig(env()).pdfMaxBytes).toBe(8_000_000);
    expect(() => parsePublisherConfig(env({ PDF_MAX_BYTES: '8000001' }))).toThrow(
      'PDF_MAX_BYTES must be between 8000000 and 8000000'
    );
  });
});
