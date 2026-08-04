import { isValidCacheSigningSecret } from '../../convex/lib/publicationHttp';
import { PUBLICATION_MAX_PICKUP } from '../../src/shared/asset-publishing/publication';

export type PublisherConfig = {
  captureBaseUrl: string;
  convexExecutorBaseUrl: string;
  workWindowMs: number;
  browserCaptureTimeoutMs: number;
  browserCleanupGraceMs: number;
  pdfMaxBytes: number;
};

const COMPLETION_MARGIN_MS = 5_000;
export const MAX_ASSIGNED_ITEMS = PUBLICATION_MAX_PICKUP;

function integer(name: string, value: string, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function absoluteHttpsUrl(name: string, value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error(`${name} must be an absolute HTTPS URL without credentials or fragment`);
  }
  return url.toString().replace(/\/$/, '');
}

export function parsePublisherConfig(env: Env): PublisherConfig {
  if (!env.ASSET_PUBLISHER_EXECUTOR_SECRET) {
    throw new Error('Executor secret must be present');
  }
  if (!isValidCacheSigningSecret(env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET)) {
    throw new Error('Cache-token signing secret must be a canonical 256-bit secret');
  }
  if (env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET === env.ASSET_PUBLISHER_EXECUTOR_SECRET) {
    throw new Error('Executor and cache-token secrets must be distinct');
  }
  const workWindowMs = integer('WORK_WINDOW_MS', env.WORK_WINDOW_MS, 1, 240_000);
  const browserCaptureTimeoutMs = integer(
    'BROWSER_CAPTURE_TIMEOUT_MS',
    env.BROWSER_CAPTURE_TIMEOUT_MS,
    1,
    workWindowMs
  );
  const browserCleanupGraceMs = integer(
    'BROWSER_CLEANUP_GRACE_MS',
    env.BROWSER_CLEANUP_GRACE_MS,
    1,
    60_000
  );
  if (browserCaptureTimeoutMs + browserCleanupGraceMs + COMPLETION_MARGIN_MS > workWindowMs) {
    throw new Error(
      'Browser capture, cleanup, and completion margins must fit the absolute executor lifecycle deadline'
    );
  }
  absoluteHttpsUrl('CONVEX_RENDER_URL', env.CONVEX_RENDER_URL);
  return {
    captureBaseUrl: absoluteHttpsUrl('CAPTURE_BASE_URL', env.CAPTURE_BASE_URL),
    convexExecutorBaseUrl: absoluteHttpsUrl(
      'CONVEX_EXECUTOR_BASE_URL',
      env.CONVEX_EXECUTOR_BASE_URL
    ),
    workWindowMs,
    browserCaptureTimeoutMs,
    browserCleanupGraceMs,
    pdfMaxBytes: integer('PDF_MAX_BYTES', env.PDF_MAX_BYTES, 8_000_000, 8_000_000),
  };
}
