import {
  publisherErrorMessage,
  serializePublisherLogEvent,
} from '../../src/app/capture/publisher-diagnostics';
import { assertCapturedPdfOutput, type PublisherBrowserSession } from './browser';
import { type PublisherConfig, supportsRendererVersion } from './config';
import type {
  AcquireResult,
  ClaimedTarget,
  ClaimResult,
  ConvexPublisherClient,
  ExactClaim,
} from './convex';
import {
  type AssetBucket,
  ConditionalWriteConflictError,
  conditionallyPutFactionSheet,
  StorageGuardError,
} from './r2';
import { rendererManifest } from './renderer-manifest.generated';
import {
  OwnedTelemetry,
  PUBLISHER_TELEMETRY_SCHEMA_VERSION,
  type PublisherBuildIdentity,
  type PublisherFailureClass,
  safeTelemetryCorrelationHash,
} from './telemetry';

type BrowserSession = Pick<PublisherBrowserSession, 'capture' | 'close'> & {
  sessionId?(): string;
};

const POST_BROWSER_CHECKPOINT_MARGIN_MS = 5_000;

export type FailurePoint =
  | 'after_lease'
  | 'after_browser_open'
  | 'after_claim'
  | 'after_render'
  | 'before_upload'
  | 'after_upload'
  | 'before_completion'
  | 'after_completion';

export type OwnedBatchDependencies = {
  client: Pick<
    ConvexPublisherClient,
    'claim' | 'releaseBatch' | 'revalidate' | 'complete' | 'fail' | 'release'
  >;
  bucket: AssetBucket;
  browserAvailable: () => Promise<boolean>;
  openBrowser: () => Promise<BrowserSession>;
  now: () => number;
  fault?: (point: FailurePoint) => void;
};

export type OwnedBatchReport = {
  status: 'completed' | 'empty' | 'stale' | 'failed' | 'systemic_stop';
  browserOpened: boolean;
  browserClosed: boolean;
  uploaded: boolean;
  completed: boolean;
  error?: string;
  telemetry: OwnedBatchTelemetry;
};

export type OwnedBatchTelemetryContext = {
  acquireDurationMs: number;
  identity: PublisherBuildIdentity;
  scheduledTime: string;
  triggerId: string;
};

export type OwnedBatchItemTelemetry = {
  index: 0 | 1;
  workLane: 'foreground' | 'rollout';
  claimCorrelationHash: string | null;
  rendererId: string;
  rendererMismatch: boolean;
  outcome: 'completed' | 'stale' | 'failed';
  failureClass: PublisherFailureClass | null;
  pdf: {
    bytes: number | null;
    pages: number | null;
    widthMm: number | null;
    heightMm: number | null;
  };
};

export type OwnedBatchTelemetry = {
  schemaVersion: typeof PUBLISHER_TELEMETRY_SCHEMA_VERSION;
  identity?: PublisherBuildIdentity;
  execution: {
    source: 'scheduled';
    scheduledTime?: string;
    lane: 'foreground' | 'rollout' | 'mixed';
    triggerId?: string;
  };
  batchCorrelationHash: string | null;
  maxItems: 2;
  stopReason: 'max_items' | 'empty' | 'stale' | 'failure' | 'systemic' | 'deadline';
  batchReleased: boolean;
  phasesMs: ReturnType<OwnedTelemetry['snapshot']>['phasesMs'];
  workerObservedWallMs: number;
  platform: {
    cpuMs: null;
    wallMs: null;
    memoryBytes: null;
    subrequests: null;
    invocationOutcome: null;
    source: 'cloudflare_analytics_required';
  };
  logicalCalls: ReturnType<OwnedTelemetry['snapshot']>['logicalCalls'];
  counts: {
    claimed: number;
    completed: number;
    stale: number;
    failed: number;
    terminalError: number;
  };
  invocationFailureClass: PublisherFailureClass | null;
  browser: {
    sessionCorrelationHash: string | null;
    openToCloseMs: number | null;
    closeAttemptMs: number | null;
    outcome:
      | 'not_opened'
      | 'closed'
      | 'close_failed'
      | 'close_timeout'
      | 'late_opened_closed'
      | 'late_opened_close_failed'
      | 'late_opened_close_timeout'
      | 'late_launch_unresolved_fenced';
    providerCloseReason: null;
    providerOutcomeSource: 'browser_run_history_required';
  };
  minimumLeaseMarginMs: number | null;
  leaseMarginsMs: ReturnType<OwnedTelemetry['snapshot']>['leaseMarginsMs'];
  items: OwnedBatchItemTelemetry[];
  /** Compatibility projection for existing one-item report consumers. */
  item: OwnedBatchItemTelemetry | null;
};

function errorMessage(error: unknown): string {
  return publisherErrorMessage(error);
}

function failureClass(error: unknown): PublisherFailureClass | null {
  if (error === undefined) return null;
  if (error instanceof ConditionalWriteConflictError) return 'conditional_conflict';
  if (error instanceof StorageGuardError) return 'storage_guard';
  const message = errorMessage(error);
  if (/deadline|timeout/i.test(message)) return 'timeout';
  if (/conflict/i.test(message)) return 'conflict';
  if (/^empty$|no claim/i.test(message)) return 'no_claim';
  if (/stale/i.test(message)) return 'stale';
  if (/renderer/i.test(message)) return 'renderer';
  if (/unavailable/i.test(message)) return 'browser_unavailable';
  return 'operational_failure';
}

function failureDiagnostic(value: PublisherFailureClass | null): string | undefined {
  if (value === null) return undefined;
  return `asset publisher ${value.replaceAll('_', ' ')}`;
}

function exact(claim: ClaimedTarget): ExactClaim {
  return {
    targetId: claim.targetId,
    batchToken: claim.batchToken,
    claimToken: claim.claimToken,
    generation: claim.generation,
    rendererVersion: claim.rendererVersion,
  };
}

function remaining(deadlineAt: number, now: () => number): number {
  return Math.max(0, Math.ceil(deadlineAt - now()));
}

async function withinDeadline<T>(
  operation: () => Promise<T>,
  deadlineAt: number,
  now: () => number,
  label: string
): Promise<T> {
  const available = remaining(deadlineAt, now);
  if (available <= 0) throw new Error(`${label} exhausted the executor lifecycle deadline`);
  let handle: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    handle = setTimeout(
      () => reject(new Error(`${label} exhausted the executor lifecycle deadline`)),
      available
    );
  });
  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    if (handle !== undefined) clearTimeout(handle);
  }
}

type BrowserCloseObservation = {
  closed: boolean;
  durationMs: number;
  outcome: 'closed' | 'failed' | 'timeout';
};

async function closeWithObservation(
  browser: BrowserSession,
  deadlineAt: number,
  now: () => number
): Promise<BrowserCloseObservation> {
  const startedAt = now();
  try {
    await withinDeadline(() => browser.close(), deadlineAt, now, 'Browser cleanup');
    return { closed: true, durationMs: Math.max(0, now() - startedAt), outcome: 'closed' };
  } catch (error) {
    return {
      closed: false,
      durationMs: Math.max(0, now() - startedAt),
      outcome: /deadline/i.test(errorMessage(error)) ? 'timeout' : 'failed',
    };
  }
}

type LateBrowserCleanupObservation = {
  openedAt: number;
  closedAt: number | null;
  sessionId: string | null;
  close: BrowserCloseObservation;
};

async function openWithin(
  operation: () => Promise<BrowserSession>,
  launchDeadlineAt: number,
  cleanupDeadlineAt: number,
  cleanupGraceMs: number,
  now: () => number,
  observeLaunchAttempt: (durationMs: number) => void,
  observeLateWait: (durationMs: number) => void,
  observeLateCleanup: (observation: LateBrowserCleanupObservation) => void,
  observeUnresolvedFence: () => void
): Promise<BrowserSession> {
  if (remaining(launchDeadlineAt, now) <= 0) {
    throw new Error('Browser launch exhausted the executor lifecycle deadline');
  }
  const openPromise = operation();
  const launchStartedAt = now();
  const launchOutcome = withinDeadline(
    () => openPromise,
    launchDeadlineAt,
    now,
    'Browser launch'
  ).then(
    (browser) => ({ status: 'opened' as const, browser }),
    (error: unknown) => ({ status: 'failed' as const, error })
  );
  let lateWaitStartedAt: number | null = null;
  let lateWaitRecorded = false;
  const recordLateWait = (): void => {
    if (lateWaitStartedAt === null || lateWaitRecorded) return;
    lateWaitRecorded = true;
    observeLateWait(Math.max(0, now() - lateWaitStartedAt));
  };
  const lateCleanup = openPromise.then(
    async (lateBrowser) => {
      const launch = await launchOutcome;
      if (launch.status === 'opened') return;
      const openedAt = now();
      recordLateWait();
      let sessionId: string | null = null;
      try {
        sessionId = lateBrowser.sessionId?.() ?? null;
      } catch {
        sessionId = null;
      }
      const closeStartedAt = now();
      const closeDeadlineAt =
        closeStartedAt < cleanupDeadlineAt
          ? Math.max(closeStartedAt + 1, cleanupDeadlineAt - 1)
          : closeStartedAt + cleanupGraceMs;
      const close = await closeWithObservation(lateBrowser, closeDeadlineAt, now);
      observeLateCleanup({
        openedAt,
        closedAt: close.closed ? now() : null,
        sessionId,
        close,
      });
    },
    async () => {
      await launchOutcome;
      recordLateWait();
    }
  );
  const launch = await launchOutcome;
  observeLaunchAttempt(Math.max(0, now() - launchStartedAt));
  if (launch.status === 'opened') return launch.browser;

  lateWaitStartedAt = now();
  try {
    await withinDeadline(() => lateCleanup, cleanupDeadlineAt, now, 'Late browser cleanup');
  } catch {
    recordLateWait();
    observeUnresolvedFence();
  }
  throw launch.error;
}

async function bestEffort(operation: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    console.error(
      serializePublisherLogEvent({
        event: 'asset_publisher_checkpoint_error',
        label,
        failureClass: failureClass(error),
      })
    );
  }
}

function assertUploadTime(
  executorDeadlineAt: number,
  leaseExpiresAt: number,
  uploadMarginMs: number,
  now: number
): void {
  if (now >= executorDeadlineAt) {
    throw new Error('Executor reached its absolute lifecycle deadline before upload');
  }
  if (leaseExpiresAt - now < uploadMarginMs) {
    throw new Error('Exact claim lacks the required pre-upload lease margin');
  }
}

export async function executeOwnedBatch(
  dependencies: OwnedBatchDependencies,
  config: PublisherConfig,
  acquisition: Extract<AcquireResult, { status: 'acquired' }>,
  startedAt: number,
  telemetryContext?: OwnedBatchTelemetryContext
): Promise<OwnedBatchReport> {
  const telemetry = new OwnedTelemetry(dependencies.now);
  if (telemetryContext) telemetry.recordAcquire(telemetryContext.acquireDurationMs);
  const executorDeadlineAt = Math.min(
    startedAt + config.softDeadlineMs,
    acquisition.leaseExpiresAt
  );
  const ownedOutcomeDeadlineAt = executorDeadlineAt;

  let browser: BrowserSession | undefined;
  let launchAttempted = false;
  let browserOpened = false;
  let browserClosed = false;
  let browserOpenedAt = 0;
  let browserClosedAt = 0;
  let browserDeadlineAt = 0;
  let browserSessionId: string | null = null;
  let browserSessionCorrelationHash: string | null = null;
  let browserCloseOutcome: BrowserCloseObservation['outcome'] | null = null;
  let lateBrowserCleanup: LateBrowserCleanupObservation | null = null;
  let lateBrowserLaunchUnresolved = false;
  let ownedCheckpointDeadlineAt = executorDeadlineAt;
  let claim: ClaimedTarget | undefined;
  let latestLeaseExpiresAt: number | null = null;
  type ItemState = {
    claim: ClaimedTarget;
    pdfBytes: number | null;
    pdfPages: number | null;
    pdfWidthMm: number | null;
    pdfHeightMm: number | null;
    uploaded: boolean;
    completed: boolean;
    stale: boolean;
    error?: unknown;
  };
  const itemStates: ItemState[] = [];
  let uncertainClaim = false;
  let batchReleased = false;
  let status: OwnedBatchReport['status'] = 'systemic_stop';
  let stopReason: OwnedBatchTelemetry['stopReason'] = 'systemic';
  let outcomeError: unknown;

  const closeBrowser = async (): Promise<void> => {
    if (latestLeaseExpiresAt !== null) {
      telemetry.observeLease('cleanupStart', latestLeaseExpiresAt);
    }
    if (!browser || !browserOpened) return;
    if (!browserClosed) {
      const closeDeadlineAt = Math.min(
        browserDeadlineAt - POST_BROWSER_CHECKPOINT_MARGIN_MS,
        dependencies.now() + config.browserCleanupGraceMs
      );
      const close = await telemetry.phase(
        'browserClose',
        async () =>
          await closeWithObservation(browser as BrowserSession, closeDeadlineAt, dependencies.now)
      );
      browserClosed = close.closed;
      browserCloseOutcome = close.outcome;
      if (browserClosed) browserClosedAt = dependencies.now();
    }
  };

  const runLifecycle = async (): Promise<void> => {
    dependencies.fault?.('after_lease');
    const available = await telemetry.phase('browserAvailability', async () =>
      withinDeadline(
        dependencies.browserAvailable,
        executorDeadlineAt,
        dependencies.now,
        'Browser availability check'
      )
    );
    if (!available) {
      batchReleased =
        (await telemetry.convex('releaseBatch', async () =>
          dependencies.client.releaseBatch(acquisition.batchToken, executorDeadlineAt)
        )) === 'released';
      status = 'systemic_stop';
      stopReason = 'systemic';
      outcomeError = new Error('Browser Run acquisition is unavailable');
      return;
    }

    const browserLaunchStartedAt = dependencies.now();
    browserDeadlineAt = executorDeadlineAt;
    const closeDeadlineAt = browserDeadlineAt - POST_BROWSER_CHECKPOINT_MARGIN_MS;
    const browserOperationDeadlineAt = closeDeadlineAt - config.browserCleanupGraceMs;
    ownedCheckpointDeadlineAt = browserOperationDeadlineAt;
    if (browserOperationDeadlineAt <= browserLaunchStartedAt) {
      throw new Error('No Browser lifecycle budget remains after cleanup and checkpoint margins');
    }
    launchAttempted = true;
    browser = await openWithin(
      dependencies.openBrowser,
      Math.min(browserOperationDeadlineAt, browserLaunchStartedAt + config.browserCaptureTimeoutMs),
      closeDeadlineAt,
      config.browserCleanupGraceMs,
      dependencies.now,
      (durationMs) => telemetry.recordPhase('browserLaunch', durationMs),
      (durationMs) => telemetry.recordPhase('lateBrowserWait', durationMs),
      (observation) => {
        lateBrowserCleanup = observation;
        telemetry.recordPhase('lateBrowserClose', observation.close.durationMs);
      },
      () => {
        lateBrowserLaunchUnresolved = true;
      }
    );
    browserOpened = true;
    browserOpenedAt = dependencies.now();
    if (browser.sessionId) {
      try {
        browserSessionId = browser.sessionId();
      } catch {
        browserSessionId = null;
      }
    }
    dependencies.fault?.('after_browser_open');

    while (itemStates.length < config.maxItems) {
      claim = undefined;
      let claimResult: ClaimResult;
      try {
        claimResult = await telemetry.convex('claim', async () =>
          dependencies.client.claim(acquisition.batchToken, browserOperationDeadlineAt)
        );
      } catch (firstClaimError) {
        try {
          claimResult = await telemetry.convex('claim', async () =>
            dependencies.client.claim(acquisition.batchToken, browserOperationDeadlineAt)
          );
        } catch (replayError) {
          uncertainClaim = true;
          throw new Error('Claim response was lost and exact replay could not prove its outcome', {
            cause: replayError,
          });
        }
        if (claimResult.status === 'claimed') {
          claim = claimResult;
          latestLeaseExpiresAt = claim.leaseExpiresAt;
          telemetry.observeLease('claim', latestLeaseExpiresAt);
          itemStates.push({
            claim,
            pdfBytes: null,
            pdfPages: null,
            pdfWidthMm: null,
            pdfHeightMm: null,
            uploaded: false,
            completed: false,
            stale: false,
          });
          throw new Error(
            'Claim response was lost; recovered the exact claim for failure cleanup',
            {
              cause: firstClaimError,
            }
          );
        }
      }

      if (claimResult.status !== 'claimed') {
        if (claimResult.status === 'empty') {
          status = itemStates.some((item) => item.completed) ? 'completed' : 'empty';
          stopReason = 'empty';
          if (itemStates.length === 0) outcomeError = new Error('empty');
        } else {
          status = 'systemic_stop';
          stopReason = claimResult.status === 'stale' ? 'stale' : 'systemic';
          outcomeError = new Error(claimResult.status);
        }
        return;
      }

      claim = claimResult;
      latestLeaseExpiresAt = claim.leaseExpiresAt;
      telemetry.observeLease('claim', latestLeaseExpiresAt);
      const item: ItemState = {
        claim,
        pdfBytes: null,
        pdfPages: null,
        pdfWidthMm: null,
        pdfHeightMm: null,
        uploaded: false,
        completed: false,
        stale: false,
      };
      itemStates.push(item);
      dependencies.fault?.('after_claim');
      if (!supportsRendererVersion(config, claim.rendererVersion)) {
        throw new Error('Claim renderer is not supported by this deployment');
      }

      const captureDeadlineAt = Math.min(
        browserOperationDeadlineAt,
        dependencies.now() + config.browserCaptureTimeoutMs
      );
      const capture = await telemetry.phase('capture', async () =>
        withinDeadline(
          () =>
            (browser as BrowserSession).capture(
              (claim as ClaimedTarget).renderCapability,
              remaining(captureDeadlineAt, dependencies.now)
            ),
          captureDeadlineAt,
          dependencies.now,
          'Browser capture'
        )
      );
      item.pdfBytes = capture.bytes.byteLength;
      item.pdfPages = capture.pageCount;
      item.pdfWidthMm = capture.pageWidthMm;
      item.pdfHeightMm = capture.pageHeightMm;
      if (capture.bytes.byteLength === 0 || capture.bytes.byteLength > config.pdfMaxBytes) {
        throw new Error('Captured PDF is empty or exceeds the configured byte limit');
      }
      assertCapturedPdfOutput(capture);
      dependencies.fault?.('after_render');

      assertUploadTime(
        browserOperationDeadlineAt,
        claim.leaseExpiresAt,
        config.uploadMarginMs,
        dependencies.now()
      );
      const revalidated = await telemetry.convex('revalidate', async () =>
        dependencies.client.revalidate(exact(claim as ClaimedTarget), browserOperationDeadlineAt)
      );
      if (revalidated.status !== 'valid') {
        if ('leaseExpiresAt' in revalidated) {
          latestLeaseExpiresAt = Math.min(latestLeaseExpiresAt, revalidated.leaseExpiresAt);
          telemetry.observeLease('lastPreUpload', latestLeaseExpiresAt);
        }
        await telemetry.convex('release', async () =>
          dependencies.client.release(
            exact(claim as ClaimedTarget),
            browserOperationDeadlineAt,
            true
          )
        );
        item.stale = true;
        item.error = new Error(revalidated.status);
        status = 'stale';
        stopReason = 'stale';
        outcomeError = item.error;
        return;
      }
      latestLeaseExpiresAt = Math.min(latestLeaseExpiresAt, revalidated.leaseExpiresAt);
      if (
        revalidated.factionId !== claim.factionId ||
        revalidated.assetType !== claim.assetType ||
        revalidated.payloadHash !== claim.payloadHash
      ) {
        throw new Error('Revalidation identity does not match the exact claim');
      }
      assertUploadTime(
        browserOperationDeadlineAt,
        revalidated.leaseExpiresAt,
        config.uploadMarginMs,
        dependencies.now()
      );
      telemetry.observeLease('lastPreUpload', latestLeaseExpiresAt);
      dependencies.fault?.('before_upload');
      const stored = await withinDeadline(
        () =>
          conditionallyPutFactionSheet(
            {
              head: async (key) =>
                await telemetry.r2('head', async () => dependencies.bucket.head(key)),
              put: async (key, value, options) =>
                await telemetry.r2('put', async () => dependencies.bucket.put(key, value, options)),
            },
            claim as ClaimedTarget,
            capture.bytes
          ),
        browserOperationDeadlineAt,
        dependencies.now,
        'Stable R2 write'
      );
      item.uploaded = true;
      telemetry.observeLease('postR2', latestLeaseExpiresAt);
      dependencies.fault?.('after_upload');
      dependencies.fault?.('before_completion');
      let completion: 'completed' | 'stale';
      try {
        completion = await telemetry.convex('complete', async () =>
          dependencies.client.complete(
            exact(claim as ClaimedTarget),
            stored.etag,
            capture.bytes.byteLength,
            browserOperationDeadlineAt,
            true
          )
        );
      } finally {
        telemetry.observeLease('postCompletion', latestLeaseExpiresAt);
      }
      if (completion === 'stale') {
        item.stale = true;
        item.error = new Error('stale');
        status = 'stale';
        stopReason = 'stale';
        outcomeError = item.error;
        return;
      }
      item.completed = true;
      dependencies.fault?.('after_completion');
    }
    status = 'completed';
    stopReason = 'max_items';
  };

  try {
    await runLifecycle();
  } catch (error) {
    outcomeError = error;
    const deadlineFailure = /deadline/i.test(errorMessage(error));
    const currentItem = itemStates.at(-1);
    if (currentItem && !currentItem.completed && !currentItem.stale) currentItem.error = error;
    status = currentItem?.completed
      ? 'completed'
      : uncertainClaim ||
          deadlineFailure ||
          (launchAttempted && !browserOpened) ||
          (claim !== undefined && !supportsRendererVersion(config, claim.rendererVersion))
        ? 'systemic_stop'
        : 'failed';
    stopReason = deadlineFailure
      ? 'deadline'
      : status === 'systemic_stop'
        ? 'systemic'
        : status === 'failed'
          ? 'failure'
          : 'max_items';
    if (claim && !currentItem?.completed && !currentItem?.stale) {
      const unsupportedRenderer = !supportsRendererVersion(config, claim.rendererVersion);
      await bestEffort(
        async () =>
          await telemetry.convex(unsupportedRenderer ? 'release' : 'fail', async () =>
            unsupportedRenderer
              ? dependencies.client.release(
                  exact(claim as ClaimedTarget),
                  ownedCheckpointDeadlineAt,
                  true
                )
              : dependencies.client.fail(
                  exact(claim as ClaimedTarget),
                  failureDiagnostic(failureClass(error)) ?? 'asset publisher operational failure',
                  ownedCheckpointDeadlineAt,
                  true
                )
          ),
        uncertainClaim ? 'recovered_claim' : 'owned_failure'
      );
    } else if (!launchAttempted) {
      try {
        batchReleased =
          (await telemetry.convex('releaseBatch', async () =>
            dependencies.client.releaseBatch(acquisition.batchToken, ownedOutcomeDeadlineAt)
          )) === 'released';
      } catch (releaseError) {
        console.error(
          serializePublisherLogEvent({
            event: 'asset_publisher_checkpoint_error',
            label: 'no_browser_batch_release',
            failureClass: failureClass(releaseError),
          })
        );
      }
    }
  } finally {
    await closeBrowser();
  }

  if (
    !uncertainClaim &&
    !lateBrowserLaunchUnresolved &&
    !batchReleased &&
    (!browserOpened || browserClosed)
  ) {
    try {
      batchReleased =
        (await telemetry.convex('releaseBatch', async () =>
          dependencies.client.releaseBatch(acquisition.batchToken, ownedOutcomeDeadlineAt)
        )) === 'released';
    } catch (error) {
      outcomeError ??= error;
      status = 'systemic_stop';
      stopReason = 'systemic';
    }
  } else if (uncertainClaim) {
    // The Convex release mutation also rejects while any target or snapshot owns this batch.
    // Retaining the singleton fence is the safe outcome when exact claim replay cannot be proven.
  }

  if (browserOpened && !browserClosed) {
    status = 'systemic_stop';
    stopReason = 'systemic';
    outcomeError ??= new Error('Browser cleanup did not complete within the lifecycle deadline');
  }

  const telemetrySnapshot = telemetry.snapshot();
  const observedAt = dependencies.now();
  const observedLateCleanup = lateBrowserCleanup as LateBrowserCleanupObservation | null;
  const observedBrowserOpened = browserOpened || observedLateCleanup !== null;
  const observedBrowserClosed = browserClosed || observedLateCleanup?.close.closed === true;
  const observedSessionId = browserSessionId ?? observedLateCleanup?.sessionId ?? null;
  const [batchCorrelationHash, sessionCorrelationHash, itemTelemetry] = await Promise.all([
    safeTelemetryCorrelationHash('batch', acquisition.batchToken),
    observedSessionId
      ? safeTelemetryCorrelationHash('browser_session', observedSessionId)
      : Promise.resolve(null),
    Promise.all(
      itemStates.map(
        async (item, index): Promise<OwnedBatchItemTelemetry> => ({
          index: index as 0 | 1,
          workLane: item.claim.workLane ?? 'foreground',
          claimCorrelationHash: await safeTelemetryCorrelationHash('claim', item.claim.claimToken),
          rendererId: rendererManifest.rendererId,
          rendererMismatch: !supportsRendererVersion(config, item.claim.rendererVersion),
          outcome: item.completed ? 'completed' : item.stale ? 'stale' : 'failed',
          failureClass: item.completed ? null : failureClass(item.error),
          pdf: {
            bytes: item.pdfBytes,
            pages: item.pdfPages,
            widthMm: item.pdfWidthMm,
            heightMm: item.pdfHeightMm,
          },
        })
      )
    ),
  ]);
  browserSessionCorrelationHash = sessionCorrelationHash;
  const invocationFailureClass =
    browserOpened && !browserClosed && browserCloseOutcome === 'failed'
      ? 'cleanup_failure'
      : failureClass(outcomeError);
  const lateBrowserOutcome = observedLateCleanup
    ? observedLateCleanup.close.outcome === 'closed'
      ? 'late_opened_closed'
      : observedLateCleanup.close.outcome === 'timeout'
        ? 'late_opened_close_timeout'
        : 'late_opened_close_failed'
    : null;
  const lanes = new Set(itemTelemetry.map((item) => item.workLane));
  const executionLane: OwnedBatchTelemetry['execution']['lane'] =
    lanes.size > 1 ? 'mixed' : (itemTelemetry[0]?.workLane ?? 'foreground');
  const telemetryReport: OwnedBatchTelemetry = {
    schemaVersion: PUBLISHER_TELEMETRY_SCHEMA_VERSION,
    ...(telemetryContext ? { identity: telemetryContext.identity } : {}),
    execution: {
      source: 'scheduled',
      ...(telemetryContext
        ? {
            scheduledTime: telemetryContext.scheduledTime,
            triggerId: telemetryContext.triggerId,
          }
        : {}),
      lane: executionLane,
    },
    batchCorrelationHash,
    maxItems: config.maxItems,
    stopReason,
    batchReleased,
    phasesMs: telemetrySnapshot.phasesMs,
    workerObservedWallMs: Math.max(0, observedAt - startedAt),
    platform: {
      cpuMs: null,
      wallMs: null,
      memoryBytes: null,
      subrequests: null,
      invocationOutcome: null,
      source: 'cloudflare_analytics_required',
    },
    logicalCalls: telemetrySnapshot.logicalCalls,
    counts: {
      claimed: itemStates.length,
      completed: itemStates.filter((item) => item.completed).length,
      stale: itemStates.filter((item) => item.stale).length,
      failed: itemStates.filter((item) => !item.completed && !item.stale).length,
      terminalError: 0,
    },
    invocationFailureClass,
    browser: {
      sessionCorrelationHash: browserSessionCorrelationHash,
      openToCloseMs: observedLateCleanup?.closedAt
        ? Math.max(0, observedLateCleanup.closedAt - observedLateCleanup.openedAt)
        : browserOpened && browserClosed
          ? Math.max(0, browserClosedAt - browserOpenedAt)
          : null,
      closeAttemptMs:
        observedLateCleanup?.close.durationMs ?? telemetrySnapshot.phasesMs.browserClose ?? null,
      outcome:
        lateBrowserOutcome ??
        (lateBrowserLaunchUnresolved
          ? 'late_launch_unresolved_fenced'
          : !browserOpened
            ? 'not_opened'
            : browserCloseOutcome === 'timeout'
              ? 'close_timeout'
              : browserClosed
                ? 'closed'
                : 'close_failed'),
      providerCloseReason: null,
      providerOutcomeSource: 'browser_run_history_required',
    },
    minimumLeaseMarginMs: telemetrySnapshot.minimumLeaseMarginMs,
    leaseMarginsMs: telemetrySnapshot.leaseMarginsMs,
    items: itemTelemetry,
    item: itemTelemetry[0] ?? null,
  };

  const uploaded = itemStates.some((item) => item.uploaded);
  const completed = itemStates.some((item) => item.completed);

  return {
    status,
    browserOpened: observedBrowserOpened,
    browserClosed: observedBrowserClosed,
    uploaded,
    completed,
    ...(failureDiagnostic(invocationFailureClass)
      ? { error: failureDiagnostic(invocationFailureClass) }
      : {}),
    telemetry: telemetryReport,
  };
}
