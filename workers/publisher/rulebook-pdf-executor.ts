import type { AssignedRulebookArtifactJob } from '../../src/shared/rulebooks/editionArtifactWork';
import { RULEBOOK_PDF_CAPTURE_TIMEOUT_MS } from '../../src/shared/rulebooks/pdfOptimization';
import { TargetRenderError } from './browser';
import type { PublisherBrowserSession } from './browser';
import { publicationWorkBudget } from './config';
import type { PublisherConfig } from './config';
import type { ConvexPublisherClient } from './convex';
import { putImmutableRulebookArtifact } from './rulebook-artifact-r2';
import type { RulebookArtifactBucket } from './rulebook-artifact-r2';
import { composeRulebookPdf, RulebookPdfGenerationError } from './rulebook-pdf';
import { stageRulebookPdfCapture, removeRulebookPdfCapture } from './rulebook-pdf-capture';
import type { RulebookPdfCaptureBucket } from './rulebook-pdf-capture';

type BrowserSession = Pick<PublisherBrowserSession, 'captureRulebookPdfBatch' | 'close' | 'sessionId'>;
type RulebookPdfClient = Pick<ConvexPublisherClient, 'completeRulebookArtifact' | 'failRulebookArtifact'>;

export type RulebookPdfExecution = {
  assigned: number;
  batches: number;
  pages: number;
  completed: number;
  deferred: number;
  failed: number;
  missing: number;
  reused: number;
  unprocessed: number;
  browserOpened: boolean;
  browserClosed: boolean;
  browserSessionId: string | null;
};

/** Captures each complete frozen Edition once and publishes only its validated PDF. */
export async function executeRulebookPdfWork(
  config: PublisherConfig,
  items: AssignedRulebookArtifactJob<'pdf'>[],
  dependencies: {
    bucket: RulebookPdfCaptureBucket & RulebookArtifactBucket;
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
    deferred: 0,
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
        const snapshot = staged.bundle.batches[0];
        const remainingMs = budget.workDeadlineAt - now();
        if (remainingMs <= 0) {
          result.deferred += 1;
          break;
        }
        const artifact = await browser.captureRulebookPdfBatch(
          captureToken,
          snapshot,
          Math.min(RULEBOOK_PDF_CAPTURE_TIMEOUT_MS, remainingMs)
        );
        result.batches += 1;
        result.pages += snapshot.payload.document.pageOrder.length;
        const bytes = await composeRulebookPdf(item, [{ batch: snapshot.payload, bytes: artifact.bytes }]);
        const stored = await putImmutableRulebookArtifact(
          dependencies.bucket,
          'pdf',
          item,
          bytes,
          dependencies.rendererIdentity
        );
        if (!stored.created) {
          result.reused += 1;
        }
        const status = await dependencies.client.completeRulebookArtifact(
          'pdf',
          item.artifactId,
          budget.requestDeadline()
        );
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
        const status = await dependencies.client.failRulebookArtifact(
          'pdf',
          item.artifactId,
          error,
          budget.requestDeadline()
        );
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
