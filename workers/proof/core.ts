import { sanitizePublisherDiagnostic } from '../../src/app/capture/publisher-diagnostics';

export const PROOF_R2_KEY = 'proof/faction-sheet.pdf';
export const EXPECTED_PAGE_COUNT = 2;
export const EXPECTED_PAGE_WIDTH_MM = 210;
export const EXPECTED_PAGE_HEIGHT_MM = 297;
export const MAX_BROWSER_CAPTURE_DEADLINE_MS = 360_000;
export const BROWSER_CLEANUP_GRACE_MS = 15_000;

export type ProofFailureMode = 'none' | 'render_timeout' | 'reporting_error_after_capture';

export type ProofCheckpointPhase = 'before_capture' | 'after_capture';
export type ProofOutcome = 'success' | 'failed';

export type CapturedPdf = {
  bytes: Uint8Array;
  pageCount: number;
  pageWidthMm: number;
  pageHeightMm: number;
  consoleErrors: string[];
  requestFailures: string[];
};

export interface ProofBrowser {
  capture(timeoutMs: number): Promise<CapturedPdf>;
  close(): Promise<void>;
}

export type ProofCheckpoint = {
  runId: string;
  phase: ProofCheckpointPhase;
  outcome: 'started' | ProofOutcome;
  at: string;
  metrics: {
    durationMs: number;
    browserSessionDurationMs: number;
    pdfBytes: number;
    r2Operations: number;
  };
  error?: string;
};

export type ProofExecutionDependencies = {
  now: () => number;
  monotonicNow: () => number;
  randomUUID: () => string;
  openBrowser: () => Promise<ProofBrowser>;
  checkpoint: (checkpoint: ProofCheckpoint) => Promise<void>;
  uploadPdf: (key: string, capture: CapturedPdf, runId: string) => Promise<void>;
};

export type ProofReport = {
  runId: string;
  outcome: ProofOutcome;
  failureMode: ProofFailureMode;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  browserSessionDurationMs: number;
  browserCloseOutcome: 'not_opened' | 'closed' | 'error' | 'cleanup_timed_out';
  pdfBytes: number;
  pageCount: number;
  pageWidthMm: number;
  pageHeightMm: number;
  r2Key: string;
  r2Operations: number;
  convexCalls: number;
  convexBeforeCheckpointLatencyMs: number | null;
  convexAfterCheckpointLatencyMs: number | null;
  consoleErrors: string[];
  requestFailures: string[];
  error?: string;
};

function messageFrom(error: unknown): string {
  return sanitizePublisherDiagnostic(error instanceof Error ? error.message : String(error));
}

function appendError(current: string | undefined, next: string): string {
  return current ? `${current}; ${next}` : next;
}

const deadlineToken = Symbol('browser-capture-deadline');

function timer(ms: number) {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<typeof deadlineToken>((resolve) => {
    handle = setTimeout(() => resolve(deadlineToken), ms);
  });
  return {
    promise,
    cancel: () => {
      if (handle !== undefined) clearTimeout(handle);
    },
  };
}

async function settlesWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  const cleanupTimer = timer(timeoutMs);
  try {
    return (await Promise.race([promise.then(() => true), cleanupTimer.promise])) === true;
  } finally {
    cleanupTimer.cancel();
  }
}

function assertCaptureContract(capture: CapturedPdf): void {
  if (capture.pageCount !== EXPECTED_PAGE_COUNT) {
    throw new Error(`Expected ${EXPECTED_PAGE_COUNT} PDF pages, received ${capture.pageCount}`);
  }
  if (
    Math.abs(capture.pageWidthMm - EXPECTED_PAGE_WIDTH_MM) > 0.5 ||
    Math.abs(capture.pageHeightMm - EXPECTED_PAGE_HEIGHT_MM) > 0.5
  ) {
    throw new Error(
      `Expected ${EXPECTED_PAGE_WIDTH_MM} mm x ${EXPECTED_PAGE_HEIGHT_MM} mm pages, received ${capture.pageWidthMm.toFixed(2)} mm x ${capture.pageHeightMm.toFixed(2)} mm`
    );
  }
  if (capture.consoleErrors.length > 0) {
    throw new Error(`Capture console errors: ${capture.consoleErrors.join(' | ')}`);
  }
  if (capture.requestFailures.length > 0) {
    throw new Error(`Capture request failures: ${capture.requestFailures.join(' | ')}`);
  }
  if (capture.bytes.byteLength === 0) {
    throw new Error('Browser returned an empty PDF');
  }
}

export async function executeOnePdfProof(
  dependencies: ProofExecutionDependencies,
  options: { failureMode: ProofFailureMode; renderTimeoutMs: number }
): Promise<ProofReport> {
  const startedAtMs = dependencies.now();
  const runId = dependencies.randomUUID();
  let browser: ProofBrowser | undefined;
  let browserOpenedAtMs: number | undefined;
  let browserSessionDurationMs = 0;
  let browserCloseOutcome: ProofReport['browserCloseOutcome'] = 'not_opened';
  let capture: CapturedPdf | undefined;
  let convexCalls = 0;
  let convexBeforeCheckpointLatencyMs: number | null = null;
  let convexAfterCheckpointLatencyMs: number | null = null;
  let r2Operations = 0;
  let outcome: ProofOutcome = 'failed';
  let errorMessage: string | undefined;
  let closePromise: Promise<void> | undefined;
  let skipFinalCloseWait = false;

  const closeBrowser = (): Promise<void> => {
    if (!browser) return Promise.resolve();
    closePromise ??= browser.close().then(
      () => {
        browserCloseOutcome = 'closed';
      },
      (error: unknown) => {
        browserCloseOutcome = 'error';
        outcome = 'failed';
        errorMessage = appendError(errorMessage, `Browser close failed: ${messageFrom(error)}`);
      }
    );
    return closePromise;
  };

  const closeBrowserWithinGrace = async (context: string): Promise<boolean> => {
    if (await settlesWithin(closeBrowser(), BROWSER_CLEANUP_GRACE_MS)) return true;
    browserCloseOutcome = 'cleanup_timed_out';
    outcome = 'failed';
    errorMessage = appendError(
      errorMessage,
      `Browser cleanup ${context} did not finish within ${BROWSER_CLEANUP_GRACE_MS} ms`
    );
    return false;
  };

  try {
    const checkpointStartedAt = dependencies.monotonicNow();
    convexCalls += 1;
    try {
      await dependencies.checkpoint({
        runId,
        phase: 'before_capture',
        outcome: 'started',
        at: new Date(dependencies.now()).toISOString(),
        metrics: {
          durationMs: dependencies.now() - startedAtMs,
          browserSessionDurationMs,
          pdfBytes: 0,
          r2Operations,
        },
      });
    } finally {
      convexBeforeCheckpointLatencyMs = Math.max(
        0,
        dependencies.monotonicNow() - checkpointStartedAt
      );
    }

    const captureDeadlineMs =
      options.failureMode === 'render_timeout' ? 1 : options.renderTimeoutMs;
    const captureStartedAt = dependencies.monotonicNow();
    const captureDeadline = timer(captureDeadlineMs);
    browserOpenedAtMs = dependencies.now();
    const openPromise = dependencies.openBrowser();
    try {
      const opened = await Promise.race([
        openPromise.then((value) => ({ kind: 'opened' as const, value })),
        captureDeadline.promise,
      ]);
      if (opened === deadlineToken) {
        const lateCleanup = openPromise
          .then(async (value) => {
            browser = value;
            await closeBrowser();
          })
          .catch(() => undefined);
        if (!(await settlesWithin(lateCleanup, BROWSER_CLEANUP_GRACE_MS))) {
          browserCloseOutcome = 'cleanup_timed_out';
          outcome = 'failed';
          errorMessage = appendError(
            errorMessage,
            `Browser cleanup after launch timeout did not finish within ${BROWSER_CLEANUP_GRACE_MS} ms`
          );
          skipFinalCloseWait = true;
        }
        throw new Error(`Browser capture exceeded the ${captureDeadlineMs} ms end-to-end deadline`);
      }

      browser = opened.value;
      const elapsedBeforeCapture = Math.max(0, dependencies.monotonicNow() - captureStartedAt);
      const remainingCaptureMs = Math.max(1, captureDeadlineMs - elapsedBeforeCapture);
      const capturePromise = browser.capture(remainingCaptureMs);
      const captured = await Promise.race([capturePromise, captureDeadline.promise]);
      if (captured === deadlineToken) {
        if (!(await closeBrowserWithinGrace('after capture timeout'))) {
          skipFinalCloseWait = true;
        }
        throw new Error(`Browser capture exceeded the ${captureDeadlineMs} ms end-to-end deadline`);
      }
      capture = captured;
    } finally {
      captureDeadline.cancel();
    }
    assertCaptureContract(capture);

    if (options.failureMode === 'reporting_error_after_capture') {
      throw new Error('Injected reporting-path error after capture and before R2 upload');
    }
    r2Operations += 1;
    await dependencies.uploadPdf(PROOF_R2_KEY, capture, runId);
    outcome = 'success';
  } catch (error) {
    const caughtMessage = messageFrom(error);
    errorMessage = errorMessage ? `${caughtMessage}; ${errorMessage}` : caughtMessage;
  } finally {
    if (browser && !skipFinalCloseWait) {
      await closeBrowserWithinGrace('after proof execution');
    }

    if (browserOpenedAtMs !== undefined) {
      browserSessionDurationMs = dependencies.now() - browserOpenedAtMs;
    }
  }

  const afterCheckpointStartedAt = dependencies.monotonicNow();
  convexCalls += 1;
  try {
    await dependencies.checkpoint({
      runId,
      phase: 'after_capture',
      outcome,
      at: new Date(dependencies.now()).toISOString(),
      metrics: {
        durationMs: dependencies.now() - startedAtMs,
        browserSessionDurationMs,
        pdfBytes: capture?.bytes.byteLength ?? 0,
        r2Operations,
      },
      ...(errorMessage ? { error: errorMessage } : {}),
    });
  } catch (error) {
    outcome = 'failed';
    errorMessage = appendError(
      errorMessage,
      `After-capture Convex checkpoint failed: ${messageFrom(error)}`
    );
  } finally {
    convexAfterCheckpointLatencyMs = Math.max(
      0,
      dependencies.monotonicNow() - afterCheckpointStartedAt
    );
  }

  const completedAtMs = dependencies.now();
  return {
    runId,
    outcome,
    failureMode: options.failureMode,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    browserSessionDurationMs,
    browserCloseOutcome,
    pdfBytes: capture?.bytes.byteLength ?? 0,
    pageCount: capture?.pageCount ?? 0,
    pageWidthMm: capture?.pageWidthMm ?? 0,
    pageHeightMm: capture?.pageHeightMm ?? 0,
    r2Key: PROOF_R2_KEY,
    r2Operations,
    convexCalls,
    convexBeforeCheckpointLatencyMs,
    convexAfterCheckpointLatencyMs,
    consoleErrors: capture?.consoleErrors ?? [],
    requestFailures: capture?.requestFailures ?? [],
    ...(errorMessage ? { error: errorMessage } : {}),
  };
}
