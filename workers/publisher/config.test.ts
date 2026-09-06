import { describe, expect, test } from 'vitest';

import { parsePublisherConfig } from './config';

function env(overrides: Record<string, string> = {}): Env {
  return {
    ASSET_PUBLISHER_EXECUTOR_SECRET: 'executor-secret',
    PUBLIC_BASE_URL: 'https://dune.zone',
    CAPTURE_BASE_URL: 'https://publisher.example.com',
    CONVEX_EXECUTOR_BASE_URL: 'https://convex.example.com/executor',
    CONVEX_RENDER_URL: 'https://convex.example.com/render',
    GIT_SHA: 'development',
    WORK_WINDOW_MS: '240000',
    BROWSER_CAPTURE_TIMEOUT_MS: '45000',
    BROWSER_CLEANUP_GRACE_MS: '15000',
    PDF_MAX_BYTES: '8000000',
    ...overrides,
  } as unknown as Env;
}

describe('publisher lifecycle configuration', () => {
  test('accepts the five-minute cron work-window contract without Renderer selection', () => {
    const config = parsePublisherConfig(env());
    expect(config).toEqual({
      publicBaseUrl: 'https://dune.zone',
      captureBaseUrl: 'https://publisher.example.com',
      convexExecutorBaseUrl: 'https://convex.example.com/executor',
      workWindowMs: 240_000,
      browserCaptureTimeoutMs: 45_000,
      browserCleanupGraceMs: 15_000,
      pdfMaxBytes: 8_000_000,
    });
  });

  test('validates the capture route upstream without projecting it into executor config', () => {
    expect(() => parsePublisherConfig(env({ CONVEX_RENDER_URL: 'not-a-url' }))).toThrow();
  });

  test('rejects phase settings that exceed the four-minute work window', () => {
    expect(() =>
      parsePublisherConfig(env({ BROWSER_CAPTURE_TIMEOUT_MS: '225001', BROWSER_CLEANUP_GRACE_MS: '10000' }))
    ).toThrow(/absolute executor lifecycle deadline/);
  });

  test('still requires the executor credential before taking work', () => {
    expect(() => parsePublisherConfig(env({ ASSET_PUBLISHER_EXECUTOR_SECRET: '' }))).toThrow(
      'Executor secret must be present'
    );
  });

  test('keeps the structural PDF cap at 8,000,000 bytes', () => {
    expect(parsePublisherConfig(env()).pdfMaxBytes).toBe(8_000_000);
    expect(() => parsePublisherConfig(env({ PDF_MAX_BYTES: '8000001' }))).toThrow(
      'PDF_MAX_BYTES must be between 8000000 and 8000000'
    );
  });
});
