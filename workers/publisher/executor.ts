import { createCacheToken } from '../../convex/lib/publicationHttp';
import { type CapturedPdf, type PublisherBrowserSession, TargetRenderError } from './browser';
import type { PublisherConfig } from './config';
import type { AssignedPublicationJob, ConvexPublisherClient } from './convex';
import { type AssetBucket, putPublishedAsset } from './r2';

type BrowserSession = Pick<PublisherBrowserSession, 'capture' | 'close' | 'sessionId'>;
type PublisherClient = Pick<ConvexPublisherClient, 'complete' | 'fail'>;

export type ItemListDependencies = {
  bucket: AssetBucket;
  client: PublisherClient;
  cacheTokenSecret: string;
  openBrowser: () => Promise<BrowserSession>;
  now?: () => number;
  signCacheToken?: typeof createCacheToken;
};

export type ItemListExecution = {
  assigned: number;
  rendered: number;
  completed: number;
  failed: number;
  missing: number;
  unprocessed: number;
  browserOpened: boolean;
  browserClosed: boolean;
  browserSessionId: string | null;
};

function requestDeadline(now: () => number, absoluteDeadlineAt: number): number {
  return Math.min(absoluteDeadlineAt, now() + 15_000);
}

function assertCapturedSize(captured: CapturedPdf, maximum: number): void {
  if (captured.bytes.byteLength <= 0 || captured.bytes.byteLength > maximum) {
    throw new TargetRenderError(`Captured PDF must be between 1 and ${maximum} bytes`);
  }
}

/** Processes one fixed Convex assignment in exactly one Browser session. */
export async function executeItemList(
  config: PublisherConfig,
  items: AssignedPublicationJob[],
  dependencies: ItemListDependencies
): Promise<ItemListExecution> {
  if (items.length < 1) throw new Error('Assigned Publication job list must not be empty');
  const now = dependencies.now ?? Date.now;
  const signCacheToken = dependencies.signCacheToken ?? createCacheToken;
  const workDeadlineAt = now() + config.workWindowMs;
  const completionDeadlineAt = workDeadlineAt + config.browserCleanupGraceMs;
  const result: ItemListExecution = {
    assigned: items.length,
    rendered: 0,
    completed: 0,
    failed: 0,
    missing: 0,
    unprocessed: items.length,
    browserOpened: false,
    browserClosed: false,
    browserSessionId: null,
  };

  let browser: BrowserSession | undefined;
  let executionError: unknown;
  try {
    browser = await dependencies.openBrowser();
    result.browserOpened = true;
    result.browserSessionId = browser.sessionId();

    for (const item of items) {
      if (now() >= workDeadlineAt) break;
      try {
        const captured = await browser.capture(
          item.jobId,
          Math.min(config.browserCaptureTimeoutMs, workDeadlineAt - now())
        );
        assertCapturedSize(captured, config.pdfMaxBytes);
        result.rendered += 1;

        const cacheToken = await signCacheToken(
          item.assetId,
          item.assetType,
          dependencies.cacheTokenSecret
        );
        await putPublishedAsset(
          dependencies.bucket,
          item,
          captured.payloadHash,
          cacheToken,
          captured.bytes
        );
        const completion = await dependencies.client.complete(
          item.jobId,
          cacheToken,
          requestDeadline(now, completionDeadlineAt)
        );
        if (completion === 'completed') result.completed += 1;
        else result.missing += 1;
        result.unprocessed -= 1;
      } catch (error) {
        if (!(error instanceof TargetRenderError)) throw error;
        const failure = await dependencies.client.fail(
          item.jobId,
          error,
          requestDeadline(now, completionDeadlineAt)
        );
        if (failure === 'missing') result.missing += 1;
        else result.failed += 1;
        result.unprocessed -= 1;
      }
    }
  } catch (error) {
    executionError = error;
  } finally {
    if (browser) {
      try {
        await browser.close();
        result.browserClosed = true;
      } catch (error) {
        executionError ??= new Error('Browser cleanup failed', { cause: error });
      }
    }
  }

  if (executionError) throw executionError;
  return result;
}
