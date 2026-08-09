import type {
  Browser,
  BrowserContext,
  BrowserWorker,
  ConsoleMessage,
  Page,
  Response as PlaywrightResponse,
} from '@cloudflare/playwright';

import {
  publisherErrorMessage,
  redactPublisherResource,
  sanitizePublisherDiagnostic,
} from '../../src/app/capture/publisher-diagnostics';
import { CAPTURE_PROTOCOL } from '../../src/shared/asset-publishing/capture-protocol';
import {
  assertCapturePhysicalBounds,
  assertReadyCaptureMarker,
  waitForCaptureMarkerSettled,
} from './capture-lifecycle';
import { inspectChromiumPdf } from './pdf-inspection';
import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';

const { pdf: PDF_CONTRACT, viewport: VIEWPORT_CONTRACT } = PUBLISHER_RENDERER_CONTRACT;

export type CapturedPdf = {
  bytes: Uint8Array;
  payloadHash: string;
};

export class TargetRenderError extends Error {}

export type CaptureDiagnostics = { issues: string[]; dropped: number };

const MAX_CAPTURE_ISSUES = 12;
const MAX_CAPTURE_ISSUE_LENGTH = 512;

export function assertCapturedPdfOutput(inspection: {
  pageCount: number;
  pageWidthMm: number;
  pageHeightMm: number;
}): void {
  if (inspection.pageCount !== PDF_CONTRACT.pageCount) {
    throw new TargetRenderError('Captured PDF must contain exactly two pages');
  }
  if (
    Math.abs(inspection.pageWidthMm - PDF_CONTRACT.pageWidthMm) >
      PDF_CONTRACT.pageSizeToleranceMm ||
    Math.abs(inspection.pageHeightMm - PDF_CONTRACT.pageHeightMm) > PDF_CONTRACT.pageSizeToleranceMm
  ) {
    throw new TargetRenderError(
      `Captured PDF MediaBoxes must be ${PDF_CONTRACT.pageWidthMm} mm × ${PDF_CONTRACT.pageHeightMm} mm within ${PDF_CONTRACT.pageSizeToleranceMm} mm`
    );
  }
}

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

function failureLabel(request: {
  method(): string;
  url(): string;
  failure(): { errorText: string } | null;
}): string {
  return `${request.method()} ${redactPublisherResource(request.url())}: ${sanitizePublisherDiagnostic(
    request.failure()?.errorText ?? 'unknown failure'
  )}`;
}

function responseFailureLabel(response: PlaywrightResponse): string {
  return `${response.request().method()} ${redactPublisherResource(
    response.url()
  )}: HTTP ${response.status()}`;
}

export function registerCaptureDiagnostics(page: Page): CaptureDiagnostics {
  const diagnostics: CaptureDiagnostics = { issues: [], dropped: 0 };
  const add = (kind: string, value: string) => {
    if (diagnostics.issues.length >= MAX_CAPTURE_ISSUES) {
      diagnostics.dropped += 1;
      return;
    }
    diagnostics.issues.push(
      `${kind}: ${sanitizePublisherDiagnostic(value)}`.slice(0, MAX_CAPTURE_ISSUE_LENGTH)
    );
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

export class PublisherBrowserSession {
  constructor(
    private readonly browser: Browser,
    private readonly captureBaseUrl: string
  ) {}

  sessionId(): string {
    return this.browser.sessionId();
  }

  async capture(jobId: string, timeoutMs: number): Promise<CapturedPdf> {
    const deadline = performance.now() + timeoutMs;
    const lifecycleDeadlineAt = Date.now() + timeoutMs;
    let phase: 'setup' | 'load' | 'validate' | 'pdf' = 'setup';
    try {
      const context = await this.browser.newContext({
        deviceScaleFactor: VIEWPORT_CONTRACT.deviceScaleFactor,
        locale: 'en-US',
        timezoneId: 'UTC',
        viewport: { width: VIEWPORT_CONTRACT.width, height: VIEWPORT_CONTRACT.height },
      });
      await context.addCookies(
        publisherCaptureCookies(this.captureBaseUrl, jobId, lifecycleDeadlineAt)
      );
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
      await assertCapturePhysicalBounds(page, () => remaining(deadline));
      assertCaptureDiagnostics(diagnostics);
      phase = 'pdf';
      const bytes = await page.pdf({
        displayHeaderFooter: PDF_CONTRACT.displayHeaderFooter,
        margin: PDF_CONTRACT.marginMm,
        preferCSSPageSize: PDF_CONTRACT.preferCssPageSize,
        printBackground: PDF_CONTRACT.printBackground,
      });
      await inspectPublisherPdf(bytes);
      assertCaptureDiagnostics(diagnostics);
      return { bytes, payloadHash };
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

export async function openPublisherBrowser(
  binding: BrowserWorker,
  captureBaseUrl: string
): Promise<PublisherBrowserSession> {
  const { launch } = await import('@cloudflare/playwright');
  return new PublisherBrowserSession(await launch(binding), captureBaseUrl);
}
