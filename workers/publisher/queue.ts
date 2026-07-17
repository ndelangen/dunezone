import { publisherErrorMessage } from '../../src/app/capture/publisher-diagnostics';
import type { PublisherConfig } from './config';
import type { AcquireResult, ConvexPublisherClient } from './convex';
import { type PublisherWakeUp, parseWakeUp } from './dispatch';
import {
  executeOwnedBatch,
  type OwnedBatchDependencies,
  type OwnedBatchReport,
  type OwnedBatchTelemetry,
  type OwnedBatchTelemetryContext,
} from './executor';
import { PublisherHttpError } from './http';
import {
  boundedPublisherTelemetryEvent,
  PUBLISHER_TELEMETRY_SCHEMA_VERSION,
  type PublisherBuildIdentity,
  safeTelemetryCorrelationHash,
} from './telemetry';

export type PublisherQueueMessage = {
  id: string;
  attempts: number;
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export type QueueDependencies = {
  client: Pick<
    ConvexPublisherClient,
    | 'acquire'
    | 'claim'
    | 'settleBrowser'
    | 'releaseBatch'
    | 'revalidate'
    | 'complete'
    | 'fail'
    | 'release'
  >;
  owned: Omit<OwnedBatchDependencies, 'client'>;
  identity: PublisherBuildIdentity;
  queueName: string;
  now: () => number;
  log: (event: Record<string, unknown>) => void;
};

async function unexpectedTelemetry(
  acquisition: Extract<AcquireResult, { status: 'acquired' }>,
  config: PublisherConfig,
  context: OwnedBatchTelemetryContext,
  startedAt: number,
  now: number
): Promise<OwnedBatchTelemetry> {
  return {
    schemaVersion: PUBLISHER_TELEMETRY_SCHEMA_VERSION,
    identity: context.identity,
    queue: {
      messageId: context.messageId,
      attempt: context.queueAttempt,
      name: context.queueName,
      lane: 'foreground',
      triggerId: context.triggerId,
    },
    batchCorrelationHash: await safeTelemetryCorrelationHash('batch', acquisition.batchToken),
    configuredMaxItems: config.maxItems,
    effectiveMaxItems: config.maxItems,
    stopReason: 'systemic',
    batchReleased: false,
    phasesMs: { acquire: context.acquireDurationMs },
    workerObservedWallMs: Math.max(0, now - startedAt),
    platform: {
      cpuMs: null,
      wallMs: null,
      memoryBytes: null,
      subrequests: null,
      invocationOutcome: null,
      source: 'cloudflare_analytics_required',
    },
    logicalCalls: {
      convex: {
        acquire: 1,
        claim: 0,
        revalidate: 0,
        complete: 0,
        fail: 0,
        release: 0,
        releaseBatch: 0,
        settleBrowser: 0,
      },
      r2: { head: 0, put: 0 },
      cache: { match: 0, put: 0 },
      workerFetch: 1,
    },
    counts: { claimed: 0, completed: 0, stale: 0, failed: 0, terminalError: 0 },
    invocationFailureClass: 'unexpected_executor_failure',
    browser: {
      sessionCorrelationHash: null,
      openToCloseMs: null,
      closeAttemptMs: null,
      outcome: 'not_opened',
      providerCloseReason: null,
      providerOutcomeSource: 'browser_run_history_required',
    },
    quota: {
      reservedMs: acquisition.browserReservationMs,
      measuredLifecycleMs: null,
      settled: false,
      dailyAccountedAfterReservationMs: acquisition.dailyBrowserMs,
      denialReason: null,
    },
    minimumLeaseMarginMs: null,
    leaseMarginsMs: {
      claim: null,
      lastPreUpload: null,
      postR2: null,
      postCompletion: null,
      cleanupStart: null,
    },
    items: [],
    item: null,
  };
}

export async function consumePublisherMessage(
  message: PublisherQueueMessage,
  config: PublisherConfig,
  dependencies: QueueDependencies
): Promise<{ action: 'ack' | 'retry'; reason: string; report?: OwnedBatchReport }> {
  const queueTelemetry = {
    identity: dependencies.identity,
    queue: {
      name: dependencies.queueName,
      messageId: message.id,
      attempt: message.attempts,
      lane: 'foreground' as const,
    },
    configuredMaxItems: config.maxItems,
    effectiveMaxItems: config.maxItems,
  };
  let wakeUp: PublisherWakeUp;
  try {
    wakeUp = parseWakeUp(message.body);
  } catch (error) {
    message.ack();
    dependencies.log({
      event: 'asset_publisher_queue',
      messageId: message.id,
      action: 'ack',
      reason: 'invalid',
      error: publisherErrorMessage(error),
      ...queueTelemetry,
    });
    return { action: 'ack', reason: 'invalid' };
  }

  const startedAt = dependencies.now();
  const executorDeadlineAt = startedAt + config.softDeadlineMs;
  const acquireStartedAt = dependencies.now();
  let acquisition: AcquireResult;
  try {
    acquisition = await dependencies.client.acquire(wakeUp.triggerId, executorDeadlineAt);
  } catch (error) {
    const retryable = error instanceof PublisherHttpError && error.transient;
    if (retryable && message.attempts < config.queueMaxPreOwnershipAttempts) {
      message.retry({ delaySeconds: config.queueRetryDelaySeconds });
      dependencies.log({
        event: 'asset_publisher_queue',
        messageId: message.id,
        triggerId: wakeUp.triggerId,
        action: 'retry',
        reason: 'transient_before_ownership',
        ...queueTelemetry,
      });
      return { action: 'retry', reason: 'transient_before_ownership' };
    }
    message.ack();
    dependencies.log({
      event: 'asset_publisher_queue',
      messageId: message.id,
      triggerId: wakeUp.triggerId,
      action: 'ack',
      reason: retryable ? 'pre_ownership_retries_exhausted' : 'permanent_before_ownership',
      ...queueTelemetry,
    });
    return {
      action: 'ack',
      reason: retryable ? 'pre_ownership_retries_exhausted' : 'permanent_before_ownership',
    };
  }

  if (acquisition.status !== 'acquired') {
    message.ack();
    dependencies.log({
      event: 'asset_publisher_queue',
      messageId: message.id,
      triggerId: wakeUp.triggerId,
      action: 'ack',
      reason: acquisition.status,
      acquisition,
      ...queueTelemetry,
    });
    return { action: 'ack', reason: acquisition.status };
  }

  const telemetryContext: OwnedBatchTelemetryContext = {
    acquireDurationMs: Math.max(0, dependencies.now() - acquireStartedAt),
    identity: dependencies.identity,
    messageId: message.id,
    queueAttempt: message.attempts,
    queueName: dependencies.queueName,
    triggerId: wakeUp.triggerId,
  };

  let report: OwnedBatchReport;
  try {
    report = await executeOwnedBatch(
      { ...dependencies.owned, client: dependencies.client },
      config,
      acquisition,
      startedAt,
      telemetryContext
    );
  } catch {
    report = {
      status: 'systemic_stop',
      browserOpened: false,
      browserClosed: false,
      browserSettled: false,
      uploaded: false,
      completed: false,
      error: 'asset publisher unexpected executor failure',
      telemetry: await unexpectedTelemetry(
        acquisition,
        config,
        telemetryContext,
        startedAt,
        dependencies.now()
      ),
    };
  }
  message.ack();
  const { item: _compatibilityItem, items, ...invocationTelemetry } = report.telemetry;
  for (const item of items) {
    dependencies.log(
      boundedPublisherTelemetryEvent({
        event: 'asset_publisher_item_telemetry',
        schemaVersion: report.telemetry.schemaVersion,
        identity: report.telemetry.identity,
        queue: report.telemetry.queue,
        batchCorrelationHash: report.telemetry.batchCorrelationHash,
        minimumLeaseMarginMs: report.telemetry.minimumLeaseMarginMs,
        leaseMarginsMs: report.telemetry.leaseMarginsMs,
        item,
      })
    );
  }
  dependencies.log(
    boundedPublisherTelemetryEvent({
      event: 'asset_publisher_invocation_telemetry',
      action: 'ack',
      reason: 'consumer_owned_outcome',
      status: report.status,
      browserOpened: report.browserOpened,
      browserClosed: report.browserClosed,
      browserSettled: report.browserSettled,
      uploaded: report.uploaded,
      completed: report.completed,
      ...invocationTelemetry,
    })
  );
  return { action: 'ack', reason: 'consumer_owned_outcome', report };
}
