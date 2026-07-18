import type {
  Browser,
  BrowserContext,
  BrowserWorker,
  ConsoleMessage,
  Page,
} from '@cloudflare/playwright';

import {
  redactPublisherResource,
  sanitizePublisherDiagnostic,
} from '../../src/app/capture/publisher-diagnostics';
import { inspectChromiumPdf } from '../publisher/pdf-inspection';
import { handleProofCaptureAsset } from './capture-route';
import { acquireDefaultLimitExperimentClaim } from './claim';
import { sendConvexProofCheckpoint } from './convex';
import {
  type CapturedPdf,
  EXPECTED_PAGE_HEIGHT_MM,
  EXPECTED_PAGE_WIDTH_MM,
  executeOnePdfProof,
  MAX_BROWSER_CAPTURE_DEADLINE_MS,
  type ProofBrowser,
  type ProofFailureMode,
  type ProofReport,
} from './core';
import {
  createProofWakeUp,
  dispatchEligibleProofWakeUp,
  type ProofWakeUp,
  parseProofWakeUp,
  pollConvexProofEligibility,
} from './dispatch';
import { ProofQueueConsumer } from './queue';

const FIXED_VIEWPORT = { width: 2_100, height: 2_970 };
const DEFAULT_RENDER_TIMEOUT_MS = 45_000;
const FAILURE_MODES = new Set<ProofFailureMode>([
  'none',
  'render_timeout',
  'reporting_error_after_capture',
]);
const queueConsumer = new ProofQueueConsumer();

export interface Env {
  ASSETS: Fetcher;
  BROWSER: BrowserWorker;
  PROOF_BUCKET: R2Bucket;
  PROOF_QUEUE: Queue<ProofWakeUp>;
  PROOF_CAPTURE_URL: string;
  PROOF_CAPTURE_TOKEN: string;
  PROOF_TRIGGER_TOKEN: string;
  CONVEX_PROOF_URL: string;
  CONVEX_PROOF_ELIGIBILITY_URL: string;
  CONVEX_PROOF_TOKEN: string;
  PROOF_FAILURE_MODE?: string;
  PROOF_RENDER_TIMEOUT_MS?: string;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function hasBearerToken(request: Request, expected: string): boolean {
  return expected.length > 0 && request.headers.get('Authorization') === `Bearer ${expected}`;
}

function proofFailureMode(env: Env): ProofFailureMode {
  const value = env.PROOF_FAILURE_MODE ?? 'none';
  if (!FAILURE_MODES.has(value as ProofFailureMode)) {
    throw new Error(
      'PROOF_FAILURE_MODE must be one of: none, render_timeout, reporting_error_after_capture'
    );
  }
  return value as ProofFailureMode;
}

function renderTimeout(env: Env): number {
  const value = Number(env.PROOF_RENDER_TIMEOUT_MS ?? DEFAULT_RENDER_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_BROWSER_CAPTURE_DEADLINE_MS) {
    throw new Error(
      `PROOF_RENDER_TIMEOUT_MS must be between 1 and ${MAX_BROWSER_CAPTURE_DEADLINE_MS}`
    );
  }
  return value;
}

function requestFailureLabel(request: {
  method(): string;
  url(): string;
  failure(): { errorText: string } | null;
}): string {
  const failure = request.failure();
  return `${request.method()} ${redactPublisherResource(request.url())}: ${sanitizePublisherDiagnostic(
    failure?.errorText ?? 'unknown failure'
  )}`;
}

function factionSheetPages(page: Page) {
  return page.locator('[data-faction-sheet-page]');
}

function remainingDeadlineMs(deadlineAt: number): number {
  const remaining = Math.ceil(deadlineAt - performance.now());
  if (remaining <= 0) {
    throw new Error('Browser capture exhausted its end-to-end deadline');
  }
  return remaining;
}

async function assertCapturePageBounds(page: Page, deadlineAt: number): Promise<void> {
  await page.emulateMedia({ media: 'print' });
  const bodyMargins = await page.evaluate(() => {
    const browserGlobal = globalThis as unknown as {
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
  if (bodyMargins.some((margin) => margin !== '0px')) {
    throw new Error(`Capture document body margins are not zero: ${bodyMargins.join(' ')}`);
  }

  const expectedWidthPx = (EXPECTED_PAGE_WIDTH_MM * 96) / 25.4;
  const expectedHeightPx = (EXPECTED_PAGE_HEIGHT_MM * 96) / 25.4;
  const pages = factionSheetPages(page);
  for (let index = 0; index < 2; index += 1) {
    const bounds = await pages.nth(index).boundingBox({ timeout: remainingDeadlineMs(deadlineAt) });
    if (!bounds) {
      throw new Error(`Capture page ${index + 1} has no layout bounds`);
    }
    const expectedY = index * expectedHeightPx;
    const tolerancePx = 0.5;
    if (
      Math.abs(bounds.x) > tolerancePx ||
      Math.abs(bounds.y - expectedY) > tolerancePx ||
      Math.abs(bounds.width - expectedWidthPx) > tolerancePx ||
      Math.abs(bounds.height - expectedHeightPx) > tolerancePx
    ) {
      throw new Error(
        `Capture page ${index + 1} bounds are ${bounds.x.toFixed(2)},${bounds.y.toFixed(2)} ${bounds.width.toFixed(2)}x${bounds.height.toFixed(2)}; expected 0,${expectedY.toFixed(2)} ${expectedWidthPx.toFixed(2)}x${expectedHeightPx.toFixed(2)}`
      );
    }
  }
}

class CloudflareProofBrowser implements ProofBrowser {
  constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly captureUrl: string,
    private readonly consoleErrors: string[],
    private readonly requestFailures: string[]
  ) {}

  async capture(timeoutMs: number): Promise<CapturedPdf> {
    const deadlineAt = performance.now() + timeoutMs;
    await this.page.goto(this.captureUrl, {
      waitUntil: 'domcontentloaded',
      timeout: remainingDeadlineMs(deadlineAt),
    });
    const marker = this.page.locator('#capture-status');
    await marker.waitFor({ state: 'attached', timeout: remainingDeadlineMs(deadlineAt) });
    await this.page.waitForFunction(
      () => {
        const browserGlobal = globalThis as unknown as {
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
      { timeout: remainingDeadlineMs(deadlineAt) }
    );

    const captureState = await marker.getAttribute('data-capture-state');
    if (captureState !== 'ready') {
      throw new Error(`Capture route reported ${captureState}: ${await marker.textContent()}`);
    }

    const renderedPageCount = await factionSheetPages(this.page).count();
    if (renderedPageCount !== 2) {
      throw new Error(`Capture route rendered ${renderedPageCount} sheet pages instead of 2`);
    }
    await assertCapturePageBounds(this.page, deadlineAt);

    const bytes = await this.page.pdf({
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
      printBackground: true,
    });
    const inspection = await inspectChromiumPdf(bytes);

    return {
      bytes,
      ...inspection,
      consoleErrors: [...this.consoleErrors],
      requestFailures: [...this.requestFailures],
    };
  }

  async close(): Promise<void> {
    const [contextResult, browserResult] = await Promise.allSettled([
      this.context.close(),
      this.browser.close(),
    ]);
    if (browserResult.status === 'rejected') {
      const contextDetail =
        contextResult.status === 'rejected'
          ? `; context close also failed: ${String(contextResult.reason)}`
          : '';
      throw new Error(`Browser close failed: ${String(browserResult.reason)}${contextDetail}`);
    }
  }
}

async function openProofBrowser(env: Env): Promise<ProofBrowser> {
  const { launch } = await import('@cloudflare/playwright');
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  const browser = await launch(env.BROWSER);
  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      viewport: FIXED_VIEWPORT,
      extraHTTPHeaders: {
        'X-Asset-Proof-Token': env.PROOF_CAPTURE_TOKEN,
      },
    });
    const page = await context.newPage();
    page.on('console', (message: ConsoleMessage) => {
      if (message.type() === 'error') {
        consoleErrors.push(sanitizePublisherDiagnostic(message.text()));
      }
    });
    page.on('requestfailed', (request) => requestFailures.push(requestFailureLabel(request)));
    return new CloudflareProofBrowser(
      browser,
      context,
      page,
      env.PROOF_CAPTURE_URL,
      consoleErrors,
      requestFailures
    );
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function runOnePdfProof(env: Env): Promise<ProofReport> {
  const report = await executeOnePdfProof(
    {
      now: () => Date.now(),
      monotonicNow: () => performance.now(),
      randomUUID: () => crypto.randomUUID(),
      openBrowser: () => openProofBrowser(env),
      checkpoint: async (checkpoint) => {
        await sendConvexProofCheckpoint(
          { url: env.CONVEX_PROOF_URL, token: env.CONVEX_PROOF_TOKEN },
          checkpoint
        );
      },
      uploadPdf: async (key, capture, runId) => {
        await env.PROOF_BUCKET.put(key, capture.bytes, {
          httpMetadata: { contentType: 'application/pdf' },
          customMetadata: {
            proofRunId: runId,
            pageCount: String(capture.pageCount),
            pageSizeMm: `${capture.pageWidthMm.toFixed(2)}x${capture.pageHeightMm.toFixed(2)}`,
          },
        });
      },
    },
    { failureMode: proofFailureMode(env), renderTimeoutMs: renderTimeout(env) }
  );
  console.log(JSON.stringify({ event: 'asset_publishing_proof', ...report }));
  return report;
}

async function manualProofWakeUp(request: Request): Promise<ProofWakeUp> {
  const text = await request.text();
  if (text.trim().length === 0) {
    return createProofWakeUp(Date.now(), crypto.randomUUID());
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('Manual Queue message body must be valid JSON');
  }
  return parseProofWakeUp(body);
}

async function enqueueManualProof(env: Env, wakeUp: ProofWakeUp): Promise<void> {
  await env.PROOF_QUEUE.send(wakeUp, { contentType: 'json' });
  console.log(JSON.stringify({ event: 'asset_publishing_proof_manual_enqueue', ...wakeUp }));
}

export const proofWorker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const captureAssetResponse = await handleProofCaptureAsset(
      request,
      env.ASSETS,
      env.PROOF_CAPTURE_TOKEN
    );
    if (captureAssetResponse) {
      return captureAssetResponse;
    }

    if (url.pathname === '/__proof/health') {
      return json({ ok: true, proof: 'one-faction-sheet-queue-consumer' });
    }

    if (url.pathname === '/__proof/enqueue') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
      }
      if (!hasBearerToken(request, env.PROOF_TRIGGER_TOKEN)) {
        return json({ error: 'Not found' }, 404);
      }
      let wakeUp: ProofWakeUp;
      try {
        wakeUp = await manualProofWakeUp(request);
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : 'Invalid manual Queue message' },
          400
        );
      }
      try {
        await enqueueManualProof(env, wakeUp);
        return json({ accepted: true, ...wakeUp }, 202);
      } catch (error) {
        console.error('Manual proof Queue send failed', error);
        return json({ error: 'Queue send failed' }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const wakeUp = createProofWakeUp(controller.scheduledTime, crypto.randomUUID());
    try {
      const result = await dispatchEligibleProofWakeUp(
        {
          poll: async (message) =>
            await pollConvexProofEligibility(
              { url: env.CONVEX_PROOF_ELIGIBILITY_URL, token: env.CONVEX_PROOF_TOKEN },
              message
            ),
          send: async (message) => {
            await env.PROOF_QUEUE.send(message, { contentType: 'json' });
          },
        },
        wakeUp
      );
      console.log(JSON.stringify({ event: 'asset_publishing_proof_cron_poll', result, ...wakeUp }));
    } catch (error) {
      console.error('Proof Cron poll or Queue send failed; a later Cron may retry', error);
    }
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const [message, ...unexpectedExtras] = batch.messages;
    for (const extra of unexpectedExtras) {
      extra.ack();
      console.error(
        JSON.stringify({
          event: 'asset_publishing_proof_queue_delivery',
          messageId: extra.id,
          attempts: extra.attempts,
          action: 'ack',
          reason: 'exhausted',
          error: 'Queue delivered more than the configured one-message batch',
        })
      );
    }
    if (!message) return;
    await queueConsumer.consume(
      message,
      async (wakeUp, delivery) =>
        await acquireDefaultLimitExperimentClaim(env.PROOF_BUCKET, wakeUp, delivery),
      async () => await runOnePdfProof(env)
    );
  },
} satisfies ExportedHandler<Env, unknown>;

export default proofWorker;
