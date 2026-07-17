import {
  publisherErrorMessage,
  serializePublisherLogEvent,
} from '../../src/app/capture/publisher-diagnostics';
import { browserAvailable, openPublisherBrowser } from './browser';
import { handleCaptureRoute } from './capture-route';
import { isCronDispatchEnabled, isPublisherEnabled, parsePublisherConfig } from './config';
import { ConvexPublisherClient } from './convex';
import { handlePublicAssetRequest } from './delivery';
import { executeOwnedBatch, type OwnedBatchReport } from './executor';
import { rendererManifest } from './renderer-manifest.generated';
import { boundedPublisherTelemetryEvent, publisherBuildIdentity } from './telemetry';

function log(event: Record<string, unknown>): void {
  console.log(serializePublisherLogEvent(boundedPublisherTelemetryEvent(event)));
}

function logError(event: Record<string, unknown>): void {
  console.error(serializePublisherLogEvent(boundedPublisherTelemetryEvent(event)));
}

function client(env: Env, config: ReturnType<typeof parsePublisherConfig>) {
  return new ConvexPublisherClient({
    executorBaseUrl: config.convexExecutorBaseUrl,
    executorToken: env.ASSET_PUBLISHER_EXECUTOR_SECRET,
  });
}

function logOwnedBatchReport(report: OwnedBatchReport): void {
  const { item: _compatibilityItem, items, ...invocationTelemetry } = report.telemetry;
  for (const item of items) {
    log({
      event: 'asset_publisher_item_telemetry',
      schemaVersion: report.telemetry.schemaVersion,
      identity: report.telemetry.identity,
      execution: report.telemetry.execution,
      batchCorrelationHash: report.telemetry.batchCorrelationHash,
      minimumLeaseMarginMs: report.telemetry.minimumLeaseMarginMs,
      leaseMarginsMs: report.telemetry.leaseMarginsMs,
      item,
    });
  }
  log({
    event: 'asset_publisher_invocation_telemetry',
    status: report.status,
    browserOpened: report.browserOpened,
    browserClosed: report.browserClosed,
    uploaded: report.uploaded,
    completed: report.completed,
    ...invocationTelemetry,
  });
}

function isReservedWorkerPath(pathname: string): boolean {
  return (
    pathname === '/__asset-publisher' ||
    pathname.startsWith('/__asset-publisher/') ||
    pathname === '/published' ||
    pathname.startsWith('/published/') ||
    pathname === '/publisher-capture' ||
    pathname === '/publisher-capture.html' ||
    pathname.startsWith('/publisher-capture/')
  );
}

function reservedNotFound(): Response {
  return Response.json(
    { error: 'Not found' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } }
  );
}

export const publisherWorker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const publicAsset = await handlePublicAssetRequest(request, env, ctx);
    if (publicAsset) return publicAsset;
    const capture = await handleCaptureRoute(request, env);
    if (capture) return capture;
    const pathname = new URL(request.url).pathname;
    if (pathname === '/__asset-publisher/health') {
      const identity = publisherBuildIdentity(
        env.CF_VERSION_METADATA,
        env.SUPPORTED_RENDERER_VERSION
      );
      return Response.json(
        {
          ok: true,
          publisherEnabled: isPublisherEnabled(env),
          cronDispatchEnabled: isCronDispatchEnabled(env),
          maxItems: 2,
          supportedRendererVersion: rendererManifest.rendererVersion,
          rendererSupport: {
            supportedRendererVersions: rendererManifest.supportedRendererVersions,
            rendererId: rendererManifest.rendererId,
            configuredRendererVersion: env.SUPPORTED_RENDERER_VERSION,
            configurationMatchesManifest:
              String(env.SUPPORTED_RENDERER_VERSION) === rendererManifest.rendererVersion,
          },
          identity,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (isReservedWorkerPath(pathname)) return reservedNotFound();
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    controller.noRetry();
    if (!isPublisherEnabled(env) || !isCronDispatchEnabled(env)) {
      log({ event: 'asset_publisher_cron', result: 'disabled' });
      return;
    }
    const triggerId = crypto.randomUUID();
    const scheduledTime = new Date(controller.scheduledTime).toISOString();
    try {
      const config = parsePublisherConfig(env);
      const publisher = client(env, config);
      const startedAt = Date.now();
      const executorDeadlineAt = startedAt + config.softDeadlineMs;
      const acquireStartedAt = Date.now();
      const acquisition = await publisher.acquire(triggerId, executorDeadlineAt);
      if (acquisition.status !== 'acquired') {
        log({
          event: 'asset_publisher_cron',
          result: acquisition.status,
          reason: acquisition.status === 'empty' ? acquisition.reason : undefined,
          triggerId,
          execution: { source: 'scheduled', scheduledTime, triggerId, lane: 'foreground' },
        });
        return;
      }
      const identity = publisherBuildIdentity(
        env.CF_VERSION_METADATA,
        env.SUPPORTED_RENDERER_VERSION
      );
      const report = await executeOwnedBatch(
        {
          client: publisher,
          bucket: env.ASSET_BUCKET,
          browserAvailable: async () => await browserAvailable(env.BROWSER),
          openBrowser: async () => await openPublisherBrowser(env.BROWSER, config.captureBaseUrl),
          now: () => Date.now(),
        },
        config,
        acquisition,
        startedAt,
        {
          acquireDurationMs: Math.max(0, Date.now() - acquireStartedAt),
          identity,
          scheduledTime,
          triggerId,
        }
      );
      logOwnedBatchReport(report);
    } catch (error) {
      logError({
        event: 'asset_publisher_cron',
        result: 'failed',
        triggerId,
        execution: { source: 'scheduled', scheduledTime, triggerId, lane: 'foreground' },
        failureClass: 'operational_failure',
        error: publisherErrorMessage(error),
      });
    }
  },
} satisfies ExportedHandler<Env, unknown>;

export default publisherWorker;
