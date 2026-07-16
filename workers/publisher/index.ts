import {
  publisherErrorMessage,
  serializePublisherLogEvent,
} from '../../src/app/capture/publisher-diagnostics';
import { browserAvailable, openPublisherBrowser } from './browser';
import { handleCaptureRoute } from './capture-route';
import { isCronDispatchEnabled, isPublisherEnabled, parsePublisherConfig } from './config';
import { ConvexPublisherClient } from './convex';
import { handlePublicAssetRequest } from './delivery';
import { createWakeUp, dispatchWakeUp } from './dispatch';
import { consumePublisherMessage } from './queue';

function log(event: Record<string, unknown>): void {
  console.log(serializePublisherLogEvent(event));
}

function logError(event: Record<string, unknown>): void {
  console.error(serializePublisherLogEvent(event));
}

function client(env: Env, config: ReturnType<typeof parsePublisherConfig>) {
  return new ConvexPublisherClient({
    pollUrl: config.convexPollUrl,
    executorBaseUrl: config.convexExecutorBaseUrl,
    pollToken: env.ASSET_PUBLISHER_POLL_SECRET,
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
      return Response.json(
        {
          ok: true,
          publisherEnabled: isPublisherEnabled(env),
          cronDispatchEnabled: isCronDispatchEnabled(env),
          maxItems: 1,
          supportedRendererVersion: env.SUPPORTED_RENDERER_VERSION,
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
    const wakeUp = createWakeUp(controller.scheduledTime, crypto.randomUUID());
    try {
      const config = parsePublisherConfig(env);
      const publisher = client(env, config);
      const result = await dispatchWakeUp(
        {
          poll: async (message) =>
            await publisher.poll(message, Date.now() + config.softDeadlineMs),
          send: async (message) => {
            await env.PUBLISH_QUEUE.send(message, { contentType: 'json' });
          },
        },
        wakeUp
      );
      log({
        event: 'asset_publisher_cron',
        result,
        ...wakeUp,
      });
    } catch (error) {
      logError({
        event: 'asset_publisher_cron',
        result: 'failed',
        triggerId: wakeUp.triggerId,
        error: publisherErrorMessage(error),
      });
    }
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const [message, ...extras] = batch.messages;
    for (const extra of extras) {
      extra.ack();
      logError({
        event: 'asset_publisher_queue',
        messageId: extra.id,
        action: 'ack',
        reason: 'oversized_batch',
      });
    }
    if (!message) return;
    if (!isPublisherEnabled(env)) {
      message.ack();
      log({
        event: 'asset_publisher_queue',
        messageId: message.id,
        action: 'ack',
        reason: 'disabled',
      });
      return;
    }

    let config: ReturnType<typeof parsePublisherConfig>;
    try {
      config = parsePublisherConfig(env);
    } catch (error) {
      message.ack();
      logError({
        event: 'asset_publisher_queue',
        messageId: message.id,
        action: 'ack',
        reason: 'invalid_config',
        error: publisherErrorMessage(error),
      });
      return;
    }
    const publisher = client(env, config);
    await consumePublisherMessage(message, config, {
      client: publisher,
      now: () => Date.now(),
      log,
      owned: {
        bucket: env.ASSET_BUCKET,
        browserAvailable: async () => await browserAvailable(env.BROWSER),
        openBrowser: async () => await openPublisherBrowser(env.BROWSER, config.captureBaseUrl),
        now: () => Date.now(),
      },
    });
  },
} satisfies ExportedHandler<Env, unknown>;

export default publisherWorker;
