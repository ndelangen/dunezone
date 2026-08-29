import type {
  Browser,
  BrowserContext,
  BrowserWorker,
  ConsoleMessage,
  Page,
  Response as PlaywrightResponse,
} from '@cloudflare/playwright';

import { CAPTURE_PROTOCOL } from '../../src/shared/asset-publishing/capture-protocol';
import { isPublicationAssetType, PUBLICATION_TARGETS } from '../../src/shared/asset-publishing/publicationTargets';
import type { PublicationCapture } from '../../src/shared/asset-publishing/publicationTargets';
import {
  publisherErrorMessage,
  redactPublisherResource,
  sanitizePublisherDiagnostic,
} from '../../src/shared/asset-publishing/publisher-diagnostics';
import {
  assertCaptureImageBounds,
  assertCapturePhysicalBounds,
  assertReadyCaptureMarker,
  waitForCaptureMarkerSettled,
} from './capture-lifecycle';
import { pngDimensions } from './image-inspection';
import { inspectChromiumPdf } from './pdf-inspection';
import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';

const { pdf: PDF_CONTRACT, viewport: VIEWPORT_CONTRACT } = PUBLISHER_RENDERER_CONTRACT;

/**
 * What one capture produced, and in what format.
 *
 * `png` is an intermediate rather than a publishable artifact: the executor encodes it before anything is stored, so nothing ever writes a PNG under an image route.
 */
export type CapturedArtifact = {
  bytes: Uint8Array;
  payloadHash: string;
  output: 'pdf' | 'png';
};

/**
 * The failure of one asset, as opposed to the failure of the run that was capturing it.
 * This distinction is what the executor dispatches on: it catches this per item and fails that job alone, as it does `ImageInspectionError` from the byte profilers, while anything else propagates and abandons the rest of the batch so their leases lapse and the next take-work recovers them.
 * Throw it when the capture reached its output and the output is wrong, and let a plain `Error` stand for anything that says the browser, the network or the Worker is in no state to continue.
 */
export class TargetRenderError extends Error {}

/**
 * What the page said for itself while it was being captured: console errors, page errors, failed requests and HTTP failures.
 * Collection is bounded at twelve issues of 512 characters, and `dropped` counts what was refused after that, so a page failing in a loop cannot grow one job's diagnostics without bound.
 */
export type CaptureDiagnostics = { issues: string[]; dropped: number };

const MAX_CAPTURE_ISSUES = 12;
const MAX_CAPTURE_ISSUE_LENGTH = 512;

/**
 * Checks a captured PDF against the page count and physical page size the Renderer contract fixes.
 * Failure is this asset's alone, so it throws `TargetRenderError`: the geometry came out wrong for this capture, and the next job in the batch may still be fine.
 */
export function assertCapturedPdfOutput(inspection: {
  pageCount: number;
  pageWidthMm: number;
  pageHeightMm: number;
}): void {
  if (inspection.pageCount !== PDF_CONTRACT.pageCount) {
    throw new TargetRenderError('Captured PDF must contain exactly two pages');
  }
  if (
    Math.abs(inspection.pageWidthMm - PDF_CONTRACT.pageWidthMm) > PDF_CONTRACT.pageSizeToleranceMm ||
    Math.abs(inspection.pageHeightMm - PDF_CONTRACT.pageHeightMm) > PDF_CONTRACT.pageSizeToleranceMm
  ) {
    throw new TargetRenderError(
      `Captured PDF MediaBoxes must be ${PDF_CONTRACT.pageWidthMm} mm × ${PDF_CONTRACT.pageHeightMm} mm within ${PDF_CONTRACT.pageSizeToleranceMm} mm`
    );
  }
}

/**
 * The screenshot's own pixel size, read back off IHDR.
 * The bounds check proves the frame is right in CSS pixels;
 * this proves the device scale factor did not quietly turn those into something else.
 */
function assertCapturedPngSize(bytes: Uint8Array, expected: { widthPx: number; heightPx: number }): void {
  const actual = pngDimensions(bytes);
  if (actual.widthPx !== expected.widthPx || actual.heightPx !== expected.heightPx) {
    throw new TargetRenderError(
      `Captured PNG must be ${expected.widthPx}x${expected.heightPx}, got ${actual.widthPx}x${actual.heightPx}`
    );
  }
}

/**
 * Refuses a capture whose page reported any problem at all, however cosmetic it looked, because a sheet is only publishable if it rendered cleanly.
 * Unlike the assertions around it this throws a plain `Error` rather than `TargetRenderError`, which under the executor's dispatch abandons the whole batch rather than failing this job alone.
 * It is called again after the PDF or screenshot step, since producing the output can itself provoke a console error that was not there when the bounds were checked.
 */
export function assertCaptureDiagnostics(diagnostics: CaptureDiagnostics): void {
  if (!diagnostics.issues.length) {
    return;
  }
  const dropped = diagnostics.dropped ? ` | ${diagnostics.dropped} additional issues dropped` : '';
  throw new Error(`Capture issues: ${diagnostics.issues.join(' | ')}${dropped}`);
}

function remaining(deadline: number): number {
  const value = Math.ceil(deadline - performance.now());
  if (value <= 0) {
    throw new Error('Browser capture exhausted its deadline');
  }
  return value;
}

function failureLabel(request: { method(): string; url(): string; failure(): { errorText: string } | null }): string {
  return `${request.method()} ${redactPublisherResource(request.url())}: ${sanitizePublisherDiagnostic(
    request.failure()?.errorText ?? 'unknown failure'
  )}`;
}

function responseFailureLabel(response: PlaywrightResponse): string {
  return `${response.request().method()} ${redactPublisherResource(response.url())}: HTTP ${response.status()}`;
}

/**
 * Subscribes to a page's failure events and returns the record they accumulate into, which fills in as the page runs.
 * Call it before navigating: these are listeners, so anything the page reports before this returns is not in the record and cannot be asserted on.
 */
export function registerCaptureDiagnostics(page: Page): CaptureDiagnostics {
  const diagnostics: CaptureDiagnostics = { issues: [], dropped: 0 };
  const add = (kind: string, value: string) => {
    if (diagnostics.issues.length >= MAX_CAPTURE_ISSUES) {
      diagnostics.dropped += 1;
      return;
    }
    diagnostics.issues.push(`${kind}: ${sanitizePublisherDiagnostic(value)}`.slice(0, MAX_CAPTURE_ISSUE_LENGTH));
  };
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      add('console', message.text());
    }
  });
  page.on('requestfailed', (request) => add('request', failureLabel(request)));
  page.on('pageerror', (error) => add('page', publisherErrorMessage(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      add('http', responseFailureLabel(response));
    }
  });
  return diagnostics;
}

/**
 * The credentials the capture page runs under, delivered as cookies rather than in the URL so the job id never reaches a browser history, a log line or page script.
 * The job cookie is what the page presents to Convex to fetch its own snapshot, and the deadline cookie caps how long that fetch may take: the page clamps it against its own ceiling, so this can only shorten the window and never extend it.
 */
export function publisherCaptureCookies(
  captureBaseUrl: string,
  jobId: string,
  lifecycleDeadlineAt: number
): Parameters<BrowserContext['addCookies']>[0] {
  return [
    {
      name: CAPTURE_PROTOCOL.credentials.jobCookie,
      value: jobId,
      url: captureBaseUrl,
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    },
    {
      name: CAPTURE_PROTOCOL.credentials.deadlineCookie,
      value: String(lifecycleDeadlineAt),
      url: captureBaseUrl,
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    },
  ];
}

/**
 * The viewport a type captures in.
 *
 * A paged capture uses the renderer contract's fixed viewport, since the PDF page size comes from CSS rather than from the window.
 * An image capture makes the viewport the output size, so the screenshot needs no clip and one CSS pixel is one image pixel.
 */
function captureViewport(capture: PublicationCapture) {
  return capture.output === 'pdf'
    ? VIEWPORT_CONTRACT
    : { width: capture.widthPx, height: capture.heightPx, deviceScaleFactor: 1 };
}

async function inspectPublisherPdf(bytes: Uint8Array) {
  try {
    const inspection = await inspectChromiumPdf(bytes);
    assertCapturedPdfOutput(inspection);
    return inspection;
  } catch (error) {
    if (error instanceof TargetRenderError) {
      throw error;
    }
    throw new TargetRenderError('Captured output is not a valid PDF', { cause: error });
  }
}

/**
 * One provider browser session, capturing any number of assets through it.
 * Each capture gets a fresh context with its own viewport, cookies and locale, so nothing carries between two assets except the browser itself, and the locale and timezone are pinned so a capture does not render differently for where it ran.
 */
export class PublisherBrowserSession {
  constructor(
    private readonly browser: Browser,
    private readonly captureBaseUrl: string
  ) {}

  sessionId(): string {
    return this.browser.sessionId();
  }

  async capture(jobId: string, assetType: string, timeoutMs: number): Promise<CapturedArtifact> {
    if (!isPublicationAssetType(assetType)) {
      throw new TargetRenderError(`Unsupported Publication asset type: ${assetType}`);
    }
    const { capture: plan } = PUBLICATION_TARGETS[assetType];
    const viewport = captureViewport(plan);
    const deadline = performance.now() + timeoutMs;
    const lifecycleDeadlineAt = Date.now() + timeoutMs;
    let phase: 'setup' | 'load' | 'validate' | 'output' = 'setup';
    try {
      const context = await this.browser.newContext({
        deviceScaleFactor: viewport.deviceScaleFactor,
        locale: 'en-US',
        timezoneId: 'UTC',
        viewport: { width: viewport.width, height: viewport.height },
      });
      await context.addCookies(publisherCaptureCookies(this.captureBaseUrl, jobId, lifecycleDeadlineAt));
      const page = await context.newPage();
      const diagnostics = registerCaptureDiagnostics(page);
      phase = 'load';
      const response = await page.goto(`${this.captureBaseUrl}${CAPTURE_PROTOCOL.paths.document}`, {
        waitUntil: 'domcontentloaded',
        timeout: remaining(deadline),
      });
      if (!response?.ok()) {
        throw new Error(`Capture navigation returned HTTP ${response?.status()}`);
      }
      const markerResult = await waitForCaptureMarkerSettled(page, () => remaining(deadline));
      const payloadHash = assertReadyCaptureMarker(markerResult);
      phase = 'validate';
      if (plan.output === 'pdf') {
        await assertCapturePhysicalBounds(page, () => remaining(deadline));
      } else {
        await assertCaptureImageBounds(page, plan, () => remaining(deadline));
      }
      assertCaptureDiagnostics(diagnostics);
      phase = 'output';
      if (plan.output === 'pdf') {
        const bytes = await page.pdf({
          displayHeaderFooter: PDF_CONTRACT.displayHeaderFooter,
          margin: PDF_CONTRACT.marginMm,
          preferCSSPageSize: PDF_CONTRACT.preferCssPageSize,
          printBackground: PDF_CONTRACT.printBackground,
        });
        await inspectPublisherPdf(bytes);
        assertCaptureDiagnostics(diagnostics);
        return { bytes, payloadHash, output: 'pdf' };
      }
      /* The viewport is the frame, so no clip: whatever the bounds check just approved is exactly what is shot. */
      const bytes = new Uint8Array(await page.screenshot({ type: 'png', scale: 'css' }));
      assertCapturedPngSize(bytes, plan);
      assertCaptureDiagnostics(diagnostics);
      return { bytes, payloadHash, output: 'png' };
    } catch (error) {
      if (error instanceof TargetRenderError) {
        throw error;
      }
      throw new Error(`Browser capture failed during ${phase}`, { cause: error });
    }
  }

  async close(): Promise<void> {
    /*
     * Browser.close() owns the provider session lifecycle and closes all contexts. Closing the
     * context concurrently races the CDP connection teardown and can turn a normal provider close
     * into a rejected close promise even though the session has already ended.
     */
    await this.browser.close();
  }
}

/**
 * Opens a browser against the provider binding and wraps it as a session.
 * Playwright is imported at the call rather than at module scope, so a Worker that loads this module without opening a browser does not pull the browser runtime in with it.
 */
export async function openPublisherBrowser(
  binding: BrowserWorker,
  captureBaseUrl: string
): Promise<PublisherBrowserSession> {
  const { launch } = await import('@cloudflare/playwright');
  return new PublisherBrowserSession(await launch(binding), captureBaseUrl);
}
