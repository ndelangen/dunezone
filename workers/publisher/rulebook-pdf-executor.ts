import type { AssignedRulebookPdfJob } from '../../src/shared/rulebooks/pdfPublication';
import { TargetRenderError } from './browser';
import type { PublisherBrowserSession } from './browser';
import { publicationWorkBudget } from './config';
import type { PublisherConfig } from './config';
import type { ConvexPublisherClient } from './convex';
import { composeRulebookPdf, RulebookPdfGenerationError } from './rulebook-pdf';
import { stageRulebookPdfCapture, removeRulebookPdfCapture } from './rulebook-pdf-capture';
import type { RulebookPdfCaptureBucket } from './rulebook-pdf-capture';
import { putImmutableRulebookPdf } from './rulebook-pdf-r2';
import type { RulebookPdfBucket } from './rulebook-pdf-r2';

type BrowserSession = Pick<PublisherBrowserSession, 'captureRulebookPdfBatch' | 'close' | 'sessionId'>;
type RulebookPdfClient = Pick<ConvexPublisherClient, 'completeRulebookPdf' | 'failRulebookPdf'>;

export type RulebookPdfExecution = {
  assigned: number;
  batches: number;
  pages: number;
  completed: number;
  failed: number;
  missing: number;
  reused: number;
  unprocessed: number;
  browserOpened: boolean;
  browserClosed: boolean;
  browserSessionId: string | null;
};

/** Captures each frozen Edition in bounded Page batches and publishes only the validated composition. */
export async function executeRulebookPdfWork(
  config: PublisherConfig,
  items: AssignedRulebookPdfJob[],
  dependencies: {
    bucket: RulebookPdfCaptureBucket & RulebookPdfBucket;
    client: RulebookPdfClient;
    openBrowser: () => Promise<BrowserSession>;
    rendererIdentity: string;
    now?: () => number;
  }
): Promise<RulebookPdfExecution> {
  const now = dependencies.now ?? Date.now;
  const budget = publicationWorkBudget(config, now);
  const result: RulebookPdfExecution = {
    assigned: items.length,
    batches: 0,
    pages: 0,
    completed: 0,
    failed: 0,
    missing: 0,
    reused: 0,
    unprocessed: items.length,
    browserOpened: false,
    browserClosed: false,
    browserSessionId: null,
  };
  if (items.length === 0) {
    return result;
  }

  let browser: BrowserSession | undefined;
  let executionError: unknown;
  try {
    browser = await dependencies.openBrowser();
    result.browserOpened = true;
    result.browserSessionId = browser.sessionId();

    for (const item of items) {
      if (now() >= budget.workDeadlineAt) {
        break;
      }
      let captureToken: string | undefined;
      try {
        const staged = await stageRulebookPdfCapture(dependencies.bucket, item, now());
        captureToken = staged.token;
        const captured = [];
        for (const snapshot of staged.bundle.batches) {
          const remainingMs = budget.workDeadlineAt - now();
          if (remainingMs <= 0) {
            throw new Error('Rulebook PDF work window ended before every Page batch was captured');
          }
          const artifact = await browser.captureRulebookPdfBatch(
            captureToken,
            snapshot,
            Math.min(config.browserCaptureTimeoutMs, remainingMs)
          );
          captured.push({ batch: snapshot.payload, bytes: artifact.bytes });
          result.batches += 1;
          result.pages += snapshot.payload.document.pageOrder.length;
        }
        const bytes = await composeRulebookPdf(item, captured);
        const stored = await putImmutableRulebookPdf(dependencies.bucket, item, bytes, dependencies.rendererIdentity);
        if (!stored.created) {
          result.reused += 1;
        }
        const status = await dependencies.client.completeRulebookPdf(item.artifactId, budget.requestDeadline());
        if (status === 'ready') {
          result.completed += 1;
        } else {
          result.missing += 1;
        }
        result.unprocessed -= 1;
      } catch (error) {
        if (!(error instanceof TargetRenderError) && !(error instanceof RulebookPdfGenerationError)) {
          throw error;
        }
        const status = await dependencies.client.failRulebookPdf(item.artifactId, error, budget.requestDeadline());
        if (status === 'failed') {
          result.failed += 1;
        } else {
          result.missing += 1;
        }
        result.unprocessed -= 1;
      } finally {
        if (captureToken) {
          await removeRulebookPdfCapture(dependencies.bucket, captureToken);
        }
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
        executionError ??= new Error('Rulebook PDF Browser cleanup failed', { cause: error });
      }
    }
  }

  if (executionError) {
    throw executionError;
  }
  return result;
}
