import { createCacheToken } from '../../convex/lib/assetPublisherHttp';
import { publisherErrorMessage } from '../../src/app/capture/publisher-diagnostics';
import { type CapturedPdf, type PublisherBrowserSession, TargetRenderError } from './browser';
import { MAX_ASSIGNED_ITEMS, type PublisherConfig, supportsRendererVersion } from './config';
import type { ClaimedTarget, ConvexPublisherClient, ExactItemClaim } from './convex';
import { type AssetBucket, conditionallyPutFactionSheet } from './r2';

type BrowserSession = Pick<PublisherBrowserSession, 'capture' | 'close' | 'sessionId'>;
type PublisherClient = Pick<ConvexPublisherClient, 'revalidate' | 'complete' | 'fail'>;

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
  targetFailed: number;
  stale: number;
  unprocessed: number;
  browserOpened: boolean;
  browserClosed: boolean;
  browserSessionId: string | null;
};

type CompletionObservation =
  | { status: 'completed' | 'stale' }
  | { status: 'error'; error: unknown };

type PendingCompletion = {
  claim: ExactItemClaim;
  publication: { r2Etag: string; bytes: number; cacheToken: string };
  initial: Promise<CompletionObservation>;
};

function exact(item: ClaimedTarget): ExactItemClaim {
  return {
    targetId: item.targetId,
    claimToken: item.claimToken,
    generation: item.generation,
    rendererVersion: item.rendererVersion,
  };
}

function requestDeadline(now: () => number, absoluteDeadlineAt: number): number {
  return Math.min(absoluteDeadlineAt, now() + 15_000);
}

function observeCompletion(
  promise: Promise<'completed' | 'stale'>
): Promise<CompletionObservation> {
  return promise.then(
    (status) => ({ status }),
    (error: unknown) => ({ status: 'error', error })
  );
}

async function reconcileCompletion(
  pending: PendingCompletion,
  client: PublisherClient,
  absoluteDeadlineAt: number,
  now: () => number
): Promise<CompletionObservation> {
  let observation = await pending.initial;
  for (let attempt = 1; observation.status === 'error' && attempt < 3; attempt += 1) {
    if (now() >= absoluteDeadlineAt) break;
    observation = await observeCompletion(
      client.complete(pending.claim, pending.publication, requestDeadline(now, absoluteDeadlineAt))
    );
  }
  return observation;
}

function assertCapturedSize(captured: CapturedPdf, maximum: number): void {
  if (captured.bytes.byteLength <= 0 || captured.bytes.byteLength > maximum) {
    throw new TargetRenderError(`Captured PDF must be between 1 and ${maximum} bytes`);
  }
}

/** Processes one fixed Convex assignment in exactly one Browser session. */
export async function executeItemList(
  config: PublisherConfig,
  items: ClaimedTarget[],
  dependencies: ItemListDependencies
): Promise<ItemListExecution> {
  if (items.length < 1 || items.length > MAX_ASSIGNED_ITEMS) {
    throw new Error(`Assigned item list must contain between 1 and ${MAX_ASSIGNED_ITEMS} items`);
  }
  const now = dependencies.now ?? Date.now;
  const signCacheToken = dependencies.signCacheToken ?? createCacheToken;
  const startedAt = now();
  const workDeadlineAt = startedAt + config.workWindowMs;
  const completionDeadlineAt = workDeadlineAt + config.browserCleanupGraceMs;
  const pendingCompletions: PendingCompletion[] = [];
  const result: ItemListExecution = {
    assigned: items.length,
    rendered: 0,
    completed: 0,
    targetFailed: 0,
    stale: 0,
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
      if (!supportsRendererVersion(config, item.rendererVersion)) {
        throw new Error(`Unsupported assigned renderer: ${item.rendererVersion}`);
      }

      let captured: CapturedPdf;
      try {
        const remaining = workDeadlineAt - now();
        if (remaining <= 0) break;
        captured = await browser.capture(
          item.claimToken,
          Math.min(config.browserCaptureTimeoutMs, remaining)
        );
        assertCapturedSize(captured, config.pdfMaxBytes);
      } catch (error) {
        if (!(error instanceof TargetRenderError)) throw error;
        const failure = await dependencies.client.fail(
          exact(item),
          'target',
          publisherErrorMessage(error),
          requestDeadline(now, completionDeadlineAt)
        );
        if (failure === 'failed' || failure === 'blocked') result.targetFailed += 1;
        else if (failure === 'stale') result.stale += 1;
        else throw new Error(`Target failure unexpectedly retained its claim: ${failure}`);
        result.unprocessed -= 1;
        continue;
      }

      if (now() >= workDeadlineAt) break;
      result.rendered += 1;
      const revalidated = await dependencies.client.revalidate(
        exact(item),
        requestDeadline(now, workDeadlineAt)
      );
      if (revalidated.status === 'stale') {
        result.stale += 1;
        result.unprocessed -= 1;
        continue;
      }
      if (now() >= workDeadlineAt) break;
      if (
        revalidated.factionId !== item.factionId ||
        revalidated.assetType !== item.assetType ||
        revalidated.leaseExpiresAt !== item.leaseExpiresAt
      ) {
        throw new Error('Revalidation identity does not match the assigned item');
      }

      const cacheToken = await signCacheToken(
        item.factionId,
        item.assetType,
        dependencies.cacheTokenSecret
      );
      const stored = await conditionallyPutFactionSheet(
        dependencies.bucket,
        item,
        captured.payloadHash,
        cacheToken,
        captured.bytes
      );
      const publication = {
        r2Etag: stored.etag,
        bytes: captured.bytes.byteLength,
        cacheToken,
      };
      pendingCompletions.push({
        claim: exact(item),
        publication,
        initial: observeCompletion(
          dependencies.client.complete(
            exact(item),
            publication,
            requestDeadline(now, completionDeadlineAt)
          )
        ),
      });
      result.unprocessed -= 1;
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

  const completionErrors: unknown[] = [];
  for (const pending of pendingCompletions) {
    const observation = await reconcileCompletion(
      pending,
      dependencies.client,
      completionDeadlineAt,
      now
    );
    if (observation.status === 'error') completionErrors.push(observation.error);
    else if (observation.status === 'completed') result.completed += 1;
    else result.stale += 1;
  }

  if (executionError || completionErrors.length > 0) {
    throw new AggregateError(
      [...(executionError ? [executionError] : []), ...completionErrors],
      'Item-list publisher execution failed'
    );
  }
  return result;
}
