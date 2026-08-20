import { createCacheToken } from '../../convex/lib/publicationHttp';
import { PUBLICATION_TARGETS } from '../../src/shared/asset-publishing/publicationTargets';
import type { PublicationAssetType } from '../../src/shared/asset-publishing/publicationTargets';
import { TargetRenderError } from './browser';
import type { CapturedArtifact, PublisherBrowserSession } from './browser';
import { publicationWorkBudget } from './config';
import type { PublisherConfig } from './config';
import type { AssignedPublicationJob, ConvexPublisherClient } from './convex';
import { assertPublishedJpeg } from './image-encode';
import type { JpegEncoder } from './image-encode';
import { ImageInspectionError } from './image-inspection';
import { recompressCapturedPdf, RECOMPRESSED_PDF_MAX_BYTES } from './pdf-recompress';
import { putPublishedAsset } from './r2';
import type { AssetBucket } from './r2';

type BrowserSession = Pick<PublisherBrowserSession, 'capture' | 'close' | 'sessionId'>;
type PublisherClient = Pick<ConvexPublisherClient, 'complete' | 'fail'>;

export type ItemListDependencies = {
  bucket: AssetBucket;
  client: PublisherClient;
  cacheTokenSecret: string;
  openBrowser: () => Promise<BrowserSession>;
  /**
   * Required rather than optional: an image type cannot publish without it, and a missing encoder should be a compile error rather than a job that fails ten times in production.
   */
  encodeJpeg: JpegEncoder;
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
  recompressedImages: number;
  recompressionSavedBytes: number;
  encodedImages: number;
};

function assertPublishableSize(label: string, bytes: Uint8Array, maximum: number): void {
  if (bytes.byteLength <= 0 || bytes.byteLength > maximum) {
    throw new TargetRenderError(`${label} must be between 1 and ${maximum} bytes`);
  }
}

/**
 * The capture, turned into the bytes that go to R2.
 *
 * The two paths differ in how they treat failure, and deliberately.
 * Recompression is an optimization on bytes that are already publishable, so a failure logs and publishes the capture untouched.
 * Encoding is not optional: a PNG stored under a `.jpg` route is the wrong file, so a failure fails the job and the retry ladder takes it from there.
 */
async function publishableBytes(
  captured: CapturedArtifact,
  assetType: PublicationAssetType,
  jobId: string,
  config: PublisherConfig,
  dependencies: ItemListDependencies,
  result: ItemListExecution
): Promise<Uint8Array> {
  const { capture: plan } = PUBLICATION_TARGETS[assetType];
  if (captured.output === 'png' && plan.output === 'image') {
    const encoded = await dependencies.encodeJpeg(captured.bytes, plan.jpegQuality);
    assertPublishedJpeg(encoded, plan);
    assertPublishableSize('Encoded JPEG', encoded, plan.maxBytes);
    result.encodedImages += 1;
    return encoded;
  }
  if (captured.output !== 'pdf' || plan.output !== 'pdf') {
    throw new TargetRenderError(`Capture produced ${captured.output} for ${assetType}, which publishes ${plan.output}`);
  }
  assertPublishableSize('Captured PDF', captured.bytes, config.pdfMaxBytes);

  /*
   * In-place recompression (#257): lossless-downsample the big RGB portrait rasters;
   * everything else byte-untouched. A recompression failure never blocks publishing — the
   * capture is stored as-is.
   */
  try {
    const recompressed = await recompressCapturedPdf(captured.bytes);
    if (recompressed.bytesAfter > RECOMPRESSED_PDF_MAX_BYTES) {
      throw new TargetRenderError(`Recompressed PDF must be at most ${RECOMPRESSED_PDF_MAX_BYTES} bytes`);
    }
    result.recompressedImages += recompressed.swappedImages;
    result.recompressionSavedBytes += recompressed.bytesBefore - recompressed.bytesAfter;
    return recompressed.bytes;
  } catch (error) {
    if (error instanceof TargetRenderError) {
      throw error;
    }
    console.warn(
      JSON.stringify({
        event: 'publisher.recompression_failed',
        jobId,
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return captured.bytes;
  }
}

/** Processes one fixed Convex assignment in exactly one Browser session. */
export async function executeItemList(
  config: PublisherConfig,
  items: AssignedPublicationJob[],
  dependencies: ItemListDependencies
): Promise<ItemListExecution> {
  if (items.length < 1) {
    throw new Error('Assigned Publication job list must not be empty');
  }
  const now = dependencies.now ?? Date.now;
  const signCacheToken = dependencies.signCacheToken ?? createCacheToken;
  const budget = publicationWorkBudget(config, now);
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
    recompressedImages: 0,
    recompressionSavedBytes: 0,
    encodedImages: 0,
  };

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
      try {
        const captured = await browser.capture(
          item.jobId,
          item.assetType,
          Math.min(config.browserCaptureTimeoutMs, budget.workDeadlineAt - now())
        );
        result.rendered += 1;
        const publishedBytes = await publishableBytes(
          captured,
          item.assetType,
          item.jobId,
          config,
          dependencies,
          result
        );

        const cacheToken = await signCacheToken(item.assetId, item.assetType, dependencies.cacheTokenSecret);
        await putPublishedAsset(dependencies.bucket, item, captured.payloadHash, cacheToken, publishedBytes);
        const completion = await dependencies.client.complete(item.jobId, cacheToken, budget.requestDeadline());
        if (completion === 'completed') {
          result.completed += 1;
        } else {
          result.missing += 1;
        }
        result.unprocessed -= 1;
      } catch (error) {
        /*
         * A job fails alone when its own bytes are wrong, and that has two spellings: a typed assertion
         * (baseline JPEG, wrong dimensions) throws TargetRenderError, while bytes malformed beyond
         * profiling (no JPEG or PNG signature at all) surface as ImageInspectionError from the profilers
         * themselves. Both are this job's output and nobody else's; everything else is infrastructure and
         * still aborts the batch for expiry recovery.
         */
        if (!(error instanceof TargetRenderError) && !(error instanceof ImageInspectionError)) {
          throw error;
        }
        const failure = await dependencies.client.fail(item.jobId, error, budget.requestDeadline());
        if (failure === 'missing') {
          result.missing += 1;
        } else {
          result.failed += 1;
        }
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

  if (executionError) {
    throw executionError;
  }
  return result;
}
