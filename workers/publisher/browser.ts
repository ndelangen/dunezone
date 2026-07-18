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
import { captureClaimCookie, captureDeadlineCookie } from './capture-route';
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
  if (!diagnostics.issues.length) return;
  const dropped = diagnostics.dropped ? ` | ${diagnostics.dropped} additional issues dropped` : '';
  throw new Error(`Capture issues: ${diagnostics.issues.join(' | ')}${dropped}`);
}

function remaining(deadline: number): number {
  const value = Math.ceil(deadline - performance.now());
  if (value <= 0) throw new Error('Browser capture exhausted its deadline');
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
    if (message.type() === 'error') add('console', message.text());
  });
  page.on('requestfailed', (request) => add('request', failureLabel(request)));
  page.on('pageerror', (error) => add('page', publisherErrorMessage(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) add('http', responseFailureLabel(response));
  });
  return diagnostics;
}

export function publisherCaptureCookies(
  captureBaseUrl: string,
  claimToken: string,
  lifecycleDeadlineAt: number
): Parameters<BrowserContext['addCookies']>[0] {
  return [
    {
      name: captureClaimCookie,
      value: claimToken,
      url: captureBaseUrl,
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    },
    {
      name: captureDeadlineCookie,
      value: String(lifecycleDeadlineAt),
      url: captureBaseUrl,
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    },
  ];
}

export async function inspectPublisherPdf(bytes: Uint8Array) {
  try {
    const inspection = await inspectChromiumPdf(bytes);
    assertCapturedPdfOutput(inspection);
    return inspection;
  } catch (error) {
    if (error instanceof TargetRenderError) throw error;
    throw new TargetRenderError('Captured output is not a valid PDF', { cause: error });
  }
}

async function assertPageBounds(page: Page, deadline: number): Promise<void> {
  await page.emulateMedia({ media: 'print' });
  const margins = await page.evaluate(() => {
    const browserGlobal = globalThis as typeof globalThis & {
      document: { body: unknown };
      getComputedStyle(element: unknown): {
        marginTop: string;
        marginRight: string;
        marginBottom: string;
        marginLeft: string;
      };
    };
    const style = browserGlobal.getComputedStyle(browserGlobal.document.body);
    return [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft];
  });
  if (margins.some((margin) => margin !== '0px')) {
    throw new Error(`Capture document body margins are not zero: ${margins.join(' ')}`);
  }
  const width = (PDF_CONTRACT.pageWidthMm * 96) / 25.4;
  const height = (PDF_CONTRACT.pageHeightMm * 96) / 25.4;
  const pages = page.locator('[data-faction-sheet-page]');
  if ((await pages.count()) !== PDF_CONTRACT.pageCount)
    throw new Error(`Capture route did not render exactly ${PDF_CONTRACT.pageCount} pages`);
  for (let index = 0; index < PDF_CONTRACT.pageCount; index += 1) {
    const bounds = await pages.nth(index).boundingBox({ timeout: remaining(deadline) });
    if (
      !bounds ||
      Math.abs(bounds.x) > 0.5 ||
      Math.abs(bounds.y - index * height) > 0.5 ||
      Math.abs(bounds.width - width) > 0.5 ||
      Math.abs(bounds.height - height) > 0.5
    ) {
      throw new Error(`Capture page ${index + 1} has invalid physical bounds`);
    }
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

  async capture(claimToken: string, timeoutMs: number): Promise<CapturedPdf> {
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
        publisherCaptureCookies(this.captureBaseUrl, claimToken, lifecycleDeadlineAt)
      );
      const page = await context.newPage();
      const diagnostics = registerCaptureDiagnostics(page);
      phase = 'load';
      const response = await page.goto(`${this.captureBaseUrl}/__asset-publisher/capture`, {
        waitUntil: 'domcontentloaded',
        timeout: remaining(deadline),
      });
      if (!response?.ok()) {
        throw new Error(`Capture navigation returned HTTP ${response?.status()}`);
      }
      const marker = page.locator('#capture-status');
      await marker.waitFor({ state: 'attached', timeout: remaining(deadline) });
      await page.waitForFunction(
        () => {
          const browserGlobal = globalThis as typeof globalThis & {
            document: {
              querySelector(selector: string): { getAttribute(name: string): string | null } | null;
            };
          };
          return (
            browserGlobal.document
              .querySelector('#capture-status')
              ?.getAttribute('data-capture-state') !== 'loading'
          );
        },
        undefined,
        { timeout: remaining(deadline) }
      );
      const state = await marker.getAttribute('data-capture-state');
      if (state !== 'ready') {
        throw new Error(`Capture route reported ${state}: ${await marker.textContent()}`);
      }
      const payloadHash = await marker.getAttribute('data-payload-hash');
      if (!payloadHash || !/^[0-9a-f]{64}$/.test(payloadHash)) {
        throw new Error('Capture route did not expose the exact payload hash');
      }
      phase = 'validate';
      await assertPageBounds(page, deadline);
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
      if (error instanceof TargetRenderError) throw error;
      throw new Error(`Browser capture failed during ${phase}`, { cause: error });
    }
  }

  async close(): Promise<void> {
    // Browser.close() owns the provider session lifecycle and closes all contexts. Closing the
    // context concurrently races the CDP connection teardown and can turn a normal provider close
    // into a rejected close promise even though the session has already ended.
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
