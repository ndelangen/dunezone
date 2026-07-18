import {
  publisherErrorDetails,
  publisherErrorMessage,
  serializePublisherLogEvent,
} from '../../src/app/capture/publisher-diagnostics';
import { openPublisherBrowser } from './browser';
import { handleCaptureRoute } from './capture-route';
import { MAX_ASSIGNED_ITEMS, parsePublisherConfig } from './config';
import { ConvexPublisherClient } from './convex';
import { handlePublicAssetRequest } from './delivery';
import { executeItemList } from './executor';
import { rendererManifest } from './renderer-manifest.generated';
import { boundedPublisherTelemetryEvent, publisherBuildIdentity } from './telemetry';

function log(event: Record<string, unknown>): void {
  console.log(serializePublisherLogEvent(boundedPublisherTelemetryEvent(event)));
}

function logError(event: Record<string, unknown>): void {
  console.error(serializePublisherLogEvent(boundedPublisherTelemetryEvent(event)));
}

function client(env: Env, executorBaseUrl: string) {
  return new ConvexPublisherClient({
    executorBaseUrl,
    executorToken: env.ASSET_PUBLISHER_EXECUTOR_SECRET,
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
          maxItems: MAX_ASSIGNED_ITEMS,
          schedule: '*/5 * * * *',
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
    const invocationId = crypto.randomUUID();
    try {
      const config = parsePublisherConfig(env);
      const publisher = client(env, config.convexExecutorBaseUrl);
      const work = await publisher.takeWork(Date.now() + 15_000);
      if (work.status === 'empty') {
        log({
          event: 'asset_publisher_cron',
          invocationId,
          scheduledTime: controller.scheduledTime,
          result: 'empty',
          reason: work.reason,
          leaseExpiresAt: work.leaseExpiresAt,
        });
        return;
      }
      const execution = await executeItemList(config, work.items, {
        bucket: env.ASSET_BUCKET,
        client: publisher,
        cacheTokenSecret: env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET,
        openBrowser: async () => await openPublisherBrowser(env.BROWSER, config.captureBaseUrl),
      });
      log({
        event: 'asset_publisher_cron',
        invocationId,
        scheduledTime: controller.scheduledTime,
        result: 'completed',
        ...execution,
      });
    } catch (error) {
      logError({
        event: 'asset_publisher_cron',
        invocationId,
        scheduledTime: controller.scheduledTime,
        result: 'failed',
        error: publisherErrorMessage(error),
        errors: publisherErrorDetails(error),
      });
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;

export default publisherWorker;
