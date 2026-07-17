import { rendererManifest } from './renderer-manifest.generated';

export type PublisherConfig = {
  captureBaseUrl: string;
  convexExecutorBaseUrl: string;
  convexRenderUrl: string;
  supportedRendererVersion: string;
  supportedRendererVersions: readonly ['faction-sheet-v3'];
  maxItems: 2;
  softDeadlineMs: number;
  uploadMarginMs: number;
  browserCaptureTimeoutMs: number;
  browserCleanupGraceMs: number;
  pdfMaxBytes: number;
};

const POST_BROWSER_CHECKPOINT_MARGIN_MS = 5_000;

function integer(name: string, value: string, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export function supportsRendererVersion(
  config: Pick<PublisherConfig, 'supportedRendererVersions'>,
  rendererVersion: string
): boolean {
  return config.supportedRendererVersions.some(
    (supportedRendererVersion) => supportedRendererVersion === rendererVersion
  );
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
  if (String(env.SUPPORTED_RENDERER_VERSION) !== rendererManifest.rendererVersion) {
    throw new Error('Configured renderer must equal the embedded renderer compatibility version');
  }
  const softDeadlineMs = integer('SOFT_DEADLINE_MS', env.SOFT_DEADLINE_MS, 1, 240_000);
  const uploadMarginMs = integer('UPLOAD_MARGIN_MS', env.UPLOAD_MARGIN_MS, 120_000, 120_000);
  const browserCaptureTimeoutMs = integer(
    'BROWSER_CAPTURE_TIMEOUT_MS',
    env.BROWSER_CAPTURE_TIMEOUT_MS,
    1,
    softDeadlineMs
  );
  const browserCleanupGraceMs = integer(
    'BROWSER_CLEANUP_GRACE_MS',
    env.BROWSER_CLEANUP_GRACE_MS,
    1,
    60_000
  );
  if (
    browserCaptureTimeoutMs + browserCleanupGraceMs + POST_BROWSER_CHECKPOINT_MARGIN_MS >
    softDeadlineMs
  ) {
    throw new Error(
      'Browser capture, cleanup, and checkpoints must fit the executor lifecycle deadline'
    );
  }
  return {
    captureBaseUrl: absoluteHttpsUrl('CAPTURE_BASE_URL', env.CAPTURE_BASE_URL),
    convexExecutorBaseUrl: absoluteHttpsUrl(
      'CONVEX_EXECUTOR_BASE_URL',
      env.CONVEX_EXECUTOR_BASE_URL
    ),
    convexRenderUrl: absoluteHttpsUrl('CONVEX_RENDER_URL', env.CONVEX_RENDER_URL),
    supportedRendererVersion: rendererManifest.rendererVersion,
    supportedRendererVersions: rendererManifest.supportedRendererVersions,
    maxItems: 2,
    softDeadlineMs,
    uploadMarginMs,
    browserCaptureTimeoutMs,
    browserCleanupGraceMs,
    pdfMaxBytes: integer('PDF_MAX_BYTES', env.PDF_MAX_BYTES, 8_000_000, 8_000_000),
  };
}

export function isPublisherEnabled(env: Env): boolean {
  return String(env.PUBLISHER_ENABLED) === 'true';
}

export function isCronDispatchEnabled(env: Env): boolean {
  return String(env.CRON_DISPATCH_ENABLED) === 'true';
}
