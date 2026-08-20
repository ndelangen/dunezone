import { publisherFailureFields } from '../../src/shared/asset-publishing/publisher-diagnostics';
import { openPublisherBrowser } from './browser';
import { handleCaptureRoute } from './capture-route';
import { EXECUTOR_REQUEST_MARGIN_MS, MAX_ASSIGNED_ITEMS, parsePublisherConfig } from './config';
import { ConvexPublisherClient } from './convex';
import { handlePublicAssetRequest } from './delivery';
import { executeItemList } from './executor';
import { imagesJpegEncoder } from './image-encode';
import { rendererManifest } from './renderer-manifest.generated';
import { boundedPublisherTelemetryEvent, publisherBuildIdentity } from './telemetry';

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify(boundedPublisherTelemetryEvent(event)));
}

function logError(event: Record<string, unknown>): void {
  console.error(JSON.stringify(boundedPublisherTelemetryEvent(event)));
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
  return Response.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function handleStorybookEntry(request: Request, env: Env): Response | Promise<Response> | undefined {
  const url = new URL(request.url);
  if (url.pathname === '/__storybook') {
    url.pathname = '/__storybook/';
    return Response.redirect(url.href, 308);
  }
  if (url.pathname === '/__storybook/') {
    url.pathname = '/__storybook/index.html';
    return env.ASSETS.fetch(new Request(url.href, request));
  }
  return undefined;
}

const publisherWorker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const publicAsset = await handlePublicAssetRequest(request, env, ctx);
    if (publicAsset) {
      return publicAsset;
    }
    const capture = await handleCaptureRoute(request, env);
    if (capture) {
      return capture;
    }
    const storybook = handleStorybookEntry(request, env);
    if (storybook) {
      return storybook;
    }
    const pathname = new URL(request.url).pathname;
    if (pathname === '/__asset-publisher/health') {
      const identity = publisherBuildIdentity(env.CF_VERSION_METADATA, env.GIT_SHA);
      return Response.json(
        {
          ok: true,
          maxItems: MAX_ASSIGNED_ITEMS,
          schedule: '*/5 * * * *',
          rendererIdentity: rendererManifest.rendererIdentity,
          identity,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (isReservedWorkerPath(pathname)) {
      return reservedNotFound();
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    controller.noRetry();
    const invocationId = crypto.randomUUID();
    try {
      const config = parsePublisherConfig(env);
      const publisher = client(env, config.convexExecutorBaseUrl);
      const work = await publisher.takeWork(Date.now() + EXECUTOR_REQUEST_MARGIN_MS);
      if (work.status === 'empty') {
        log({
          event: 'asset_publisher_cron',
          invocationId,
          scheduledTime: controller.scheduledTime,
          result: 'empty',
          reason: work.reason,
          recovered: work.recovered,
        });
        return;
      }
      const execution = await executeItemList(config, work.items, {
        bucket: env.ASSET_BUCKET,
        client: publisher,
        cacheTokenSecret: env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET,
        openBrowser: async () => await openPublisherBrowser(env.BROWSER, config.captureBaseUrl),
        encodeJpeg: imagesJpegEncoder(env.IMAGES),
      });
      log({
        event: 'asset_publisher_cron',
        invocationId,
        scheduledTime: controller.scheduledTime,
        result: 'completed',
        recovered: work.recovered,
        ...execution,
      });
    } catch (error) {
      logError({
        event: 'asset_publisher_cron',
        invocationId,
        scheduledTime: controller.scheduledTime,
        result: 'failed',
        ...publisherFailureFields(error),
      });
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;

export default publisherWorker;
