import { serializePublisherLogEvent } from '../../src/app/capture/publisher-diagnostics';
import { rendererManifest } from './renderer-manifest.generated';

export const PUBLISHER_TELEMETRY_SCHEMA_VERSION = 2 as const;
export const MAX_CORRELATION_INPUT_BYTES = 512;
export const MAX_TELEMETRY_EVENT_BYTES = 8_192;

export type PublisherCorrelationDomain = 'batch' | 'claim' | 'browser_session';
export type PublisherFailureClass =
  | 'browser_unavailable'
  | 'cleanup_failure'
  | 'conditional_conflict'
  | 'conflict'
  | 'no_claim'
  | 'operational_failure'
  | 'renderer'
  | 'stale'
  | 'storage_guard'
  | 'telemetry_event_oversize'
  | 'timeout'
  | 'unexpected_executor_failure';

const PUBLISHER_FAILURE_CLASSES = new Set<PublisherFailureClass>([
  'browser_unavailable',
  'cleanup_failure',
  'conditional_conflict',
  'conflict',
  'no_claim',
  'operational_failure',
  'renderer',
  'stale',
  'storage_guard',
  'telemetry_event_oversize',
  'timeout',
  'unexpected_executor_failure',
]);

export type PublisherLeaseCheckpoint =
  | 'claim'
  | 'lastPreUpload'
  | 'postR2'
  | 'postCompletion'
  | 'cleanupStart';

export type PublisherBuildIdentity = {
  workerVersionId: string;
  workerVersionTag: string;
  workerVersionTimestamp: string;
  rendererId: string;
  rendererManifestDigest: string;
  configuredRendererVersion: string;
  rendererConfigurationMatchesManifest: boolean;
};

export type PublisherPhase =
  | 'acquire'
  | 'browserAvailability'
  | 'browserLaunch'
  | 'lateBrowserWait'
  | 'claim'
  | 'capture'
  | 'revalidate'
  | 'r2Head'
  | 'r2Put'
  | 'complete'
  | 'fail'
  | 'release'
  | 'releaseBatch'
  | 'browserClose'
  | 'lateBrowserClose';

export type PublisherConvexOperation =
  | 'acquire'
  | 'claim'
  | 'revalidate'
  | 'complete'
  | 'fail'
  | 'release'
  | 'releaseBatch';

export type PublisherLogicalCalls = {
  convex: Record<PublisherConvexOperation, number>;
  r2: { head: number; put: number };
  cache: { match: number; put: number };
  workerFetch: number;
};

export type OwnedTelemetrySnapshot = {
  phasesMs: Partial<Record<PublisherPhase, number>>;
  logicalCalls: PublisherLogicalCalls;
  minimumLeaseMarginMs: number | null;
  leaseMarginsMs: Record<PublisherLeaseCheckpoint, number | null>;
};

function emptyConvexCalls(): Record<PublisherConvexOperation, number> {
  return {
    acquire: 0,
    claim: 0,
    revalidate: 0,
    complete: 0,
    fail: 0,
    release: 0,
    releaseBatch: 0,
  };
}

export function publisherBuildIdentity(
  metadata: WorkerVersionMetadata,
  configuredRendererVersion: string
): PublisherBuildIdentity {
  return {
    workerVersionId: metadata.id,
    workerVersionTag: metadata.tag,
    workerVersionTimestamp: metadata.timestamp,
    rendererId: rendererManifest.rendererId,
    rendererManifestDigest: rendererManifest.digest,
    configuredRendererVersion,
    rendererConfigurationMatchesManifest:
      configuredRendererVersion === rendererManifest.rendererVersion,
  };
}

export async function telemetryCorrelationHash(
  domain: PublisherCorrelationDomain,
  value: string
): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CORRELATION_INPUT_BYTES) {
    throw new Error('Telemetry correlation input is empty or exceeds its byte limit');
  }
  const prefix = new TextEncoder().encode(`asset-publisher-correlation\0v1\0${domain}\0`);
  const input = new Uint8Array(prefix.byteLength + bytes.byteLength);
  input.set(prefix);
  input.set(bytes, prefix.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function safeTelemetryCorrelationHash(
  domain: PublisherCorrelationDomain,
  value: string
): Promise<string | null> {
  try {
    return await telemetryCorrelationHash(domain, value);
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedText(value: unknown, maximum = 256): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
    ? value
    : undefined;
}

function boundedLabel(value: unknown, maximum = 128): string | undefined {
  const text = boundedText(value, maximum);
  return text && /^[a-z0-9_:-]+$/i.test(text) ? text : undefined;
}

function nonnegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonnegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function correlationHash(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

function allowlistedFailureClass(value: unknown): PublisherFailureClass | null {
  return PUBLISHER_FAILURE_CLASSES.has(value as PublisherFailureClass)
    ? (value as PublisherFailureClass)
    : null;
}

function allowlistedValue(value: unknown, values: readonly string[]): string | null {
  return typeof value === 'string' && values.includes(value) ? value : null;
}

function identitySchema(value: unknown): Record<string, unknown> | undefined {
  const source = record(value);
  if (Object.keys(source).length === 0) return undefined;
  return {
    workerVersionId: boundedText(source.workerVersionId, 128),
    workerVersionTag: boundedText(source.workerVersionTag, 128),
    workerVersionTimestamp: boundedText(source.workerVersionTimestamp, 64),
    rendererId: rendererManifest.rendererId,
    rendererManifestDigest: rendererManifest.digest,
    rendererConfigurationMatchesManifest: boolean(source.rendererConfigurationMatchesManifest),
  };
}

function executionSchema(value: unknown): Record<string, unknown> {
  const source = record(value);
  return {
    source: source.source === 'scheduled' ? source.source : null,
    scheduledTime: boundedText(source.scheduledTime, 64),
    lane:
      source.lane === 'foreground' || source.lane === 'rollout' || source.lane === 'mixed'
        ? source.lane
        : null,
    triggerId: boundedText(source.triggerId, 128),
  };
}

function phaseSchema(value: unknown): Record<string, unknown> {
  const source = record(value);
  const phases: PublisherPhase[] = [
    'acquire',
    'browserAvailability',
    'browserLaunch',
    'lateBrowserWait',
    'claim',
    'capture',
    'revalidate',
    'r2Head',
    'r2Put',
    'complete',
    'fail',
    'release',
    'releaseBatch',
    'browserClose',
    'lateBrowserClose',
  ];
  return Object.fromEntries(phases.map((phase) => [phase, nonnegativeNumber(source[phase])]));
}

function leaseSchema(value: unknown): Record<string, unknown> {
  const source = record(value);
  const checkpoints: PublisherLeaseCheckpoint[] = [
    'claim',
    'lastPreUpload',
    'postR2',
    'postCompletion',
    'cleanupStart',
  ];
  return Object.fromEntries(
    checkpoints.map((checkpoint) => [checkpoint, nonnegativeNumber(source[checkpoint])])
  );
}

function logicalCallsSchema(value: unknown): Record<string, unknown> {
  const source = record(value);
  const convex = record(source.convex);
  const r2 = record(source.r2);
  const cache = record(source.cache);
  const convexOperations: PublisherConvexOperation[] = [
    'acquire',
    'claim',
    'revalidate',
    'complete',
    'fail',
    'release',
    'releaseBatch',
  ];
  return {
    convex: Object.fromEntries(
      convexOperations.map((operation) => [operation, nonnegativeInteger(convex[operation])])
    ),
    r2: { head: nonnegativeInteger(r2.head), put: nonnegativeInteger(r2.put) },
    cache: { match: nonnegativeInteger(cache.match), put: nonnegativeInteger(cache.put) },
    workerFetch: nonnegativeInteger(source.workerFetch),
  };
}

function countsSchema(value: unknown): Record<string, unknown> {
  const source = record(value);
  return {
    claimed: nonnegativeInteger(source.claimed),
    completed: nonnegativeInteger(source.completed),
    stale: nonnegativeInteger(source.stale),
    failed: nonnegativeInteger(source.failed),
    terminalError: nonnegativeInteger(source.terminalError),
  };
}

function itemSchema(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  const source = record(value);
  const pdf = record(source.pdf);
  return {
    index: source.index === 0 || source.index === 1 ? source.index : null,
    workLane:
      source.workLane === 'foreground' || source.workLane === 'rollout' ? source.workLane : null,
    claimCorrelationHash: correlationHash(source.claimCorrelationHash),
    rendererId: rendererManifest.rendererId,
    rendererMismatch: boolean(source.rendererMismatch),
    outcome: allowlistedValue(source.outcome, ['completed', 'stale', 'failed']),
    failureClass: allowlistedFailureClass(source.failureClass),
    pdf: {
      bytes: nonnegativeInteger(pdf.bytes),
      pages: nonnegativeInteger(pdf.pages),
      widthMm: nonnegativeNumber(pdf.widthMm),
      heightMm: nonnegativeNumber(pdf.heightMm),
    },
  };
}

function itemTelemetrySchema(event: Record<string, unknown>): Record<string, unknown> {
  return {
    event: 'asset_publisher_item_telemetry',
    schemaVersion: PUBLISHER_TELEMETRY_SCHEMA_VERSION,
    identity: identitySchema(event.identity),
    execution: executionSchema(event.execution),
    batchCorrelationHash: correlationHash(event.batchCorrelationHash),
    minimumLeaseMarginMs: nonnegativeNumber(event.minimumLeaseMarginMs),
    leaseMarginsMs: leaseSchema(event.leaseMarginsMs),
    item: itemSchema(event.item),
  };
}

function invocationTelemetrySchema(event: Record<string, unknown>): Record<string, unknown> {
  const browser = record(event.browser);
  return {
    event: 'asset_publisher_invocation_telemetry',
    schemaVersion: PUBLISHER_TELEMETRY_SCHEMA_VERSION,
    status: allowlistedValue(event.status, [
      'completed',
      'empty',
      'stale',
      'failed',
      'systemic_stop',
    ]),
    browserOpened: boolean(event.browserOpened),
    browserClosed: boolean(event.browserClosed),
    uploaded: boolean(event.uploaded),
    completed: boolean(event.completed),
    identity: identitySchema(event.identity),
    execution: executionSchema(event.execution),
    batchCorrelationHash: correlationHash(event.batchCorrelationHash),
    maxItems: event.maxItems === 2 ? 2 : null,
    stopReason: allowlistedValue(event.stopReason, [
      'max_items',
      'empty',
      'stale',
      'failure',
      'systemic',
      'deadline',
    ]),
    batchReleased: boolean(event.batchReleased),
    phasesMs: phaseSchema(event.phasesMs),
    workerObservedWallMs: nonnegativeNumber(event.workerObservedWallMs),
    platform: {
      cpuMs: null,
      wallMs: null,
      memoryBytes: null,
      subrequests: null,
      invocationOutcome: null,
      source: 'cloudflare_analytics_required',
    },
    logicalCalls: logicalCallsSchema(event.logicalCalls),
    counts: countsSchema(event.counts),
    invocationFailureClass: allowlistedFailureClass(event.invocationFailureClass),
    browser: {
      sessionCorrelationHash: correlationHash(browser.sessionCorrelationHash),
      openToCloseMs: nonnegativeNumber(browser.openToCloseMs),
      closeAttemptMs: nonnegativeNumber(browser.closeAttemptMs),
      outcome: allowlistedValue(browser.outcome, [
        'not_opened',
        'closed',
        'close_failed',
        'close_timeout',
        'late_opened_closed',
        'late_opened_close_failed',
        'late_opened_close_timeout',
        'late_launch_unresolved_fenced',
      ]),
      providerCloseReason: null,
      providerOutcomeSource: 'browser_run_history_required',
    },
    minimumLeaseMarginMs: nonnegativeNumber(event.minimumLeaseMarginMs),
    leaseMarginsMs: leaseSchema(event.leaseMarginsMs),
  };
}

function operationalEventSchema(event: Record<string, unknown>): Record<string, unknown> {
  const eventName = allowlistedValue(event.event, [
    'asset_publisher_cron',
    'asset_publisher_checkpoint_error',
    'asset_publisher_capability_validation_error',
  ]);
  return {
    event: eventName ?? 'asset_publisher_event',
    action: boundedLabel(event.action, 64),
    reason: boundedLabel(event.reason),
    result: boundedLabel(event.result),
    status: boundedLabel(event.status, 64),
    triggerId: boundedText(event.triggerId, 128),
    label: boundedLabel(event.label, 64),
    failureClass: allowlistedFailureClass(event.failureClass),
    identity: identitySchema(event.identity),
    execution: executionSchema(event.execution),
    maxItems: event.maxItems === 2 ? 2 : undefined,
  };
}

export function boundedPublisherTelemetryEvent(
  event: Record<string, unknown>
): Record<string, unknown> {
  const schema =
    event.event === 'asset_publisher_item_telemetry'
      ? itemTelemetrySchema(event)
      : event.event === 'asset_publisher_invocation_telemetry'
        ? invocationTelemetrySchema(event)
        : operationalEventSchema(event);
  const sanitized = JSON.parse(serializePublisherLogEvent(schema)) as Record<string, unknown>;
  if (new TextEncoder().encode(JSON.stringify(sanitized)).byteLength <= MAX_TELEMETRY_EVENT_BYTES) {
    return sanitized;
  }
  return {
    event: boundedText(schema.event, 128) ?? 'asset_publisher_event',
    schemaVersion: PUBLISHER_TELEMETRY_SCHEMA_VERSION,
    failureClass: 'telemetry_event_oversize' satisfies PublisherFailureClass,
    telemetryTruncated: true,
  };
}

export class OwnedTelemetry {
  private readonly phaseDurations: Partial<Record<PublisherPhase, number>> = {};
  private readonly calls: PublisherLogicalCalls = {
    convex: emptyConvexCalls(),
    r2: { head: 0, put: 0 },
    cache: { match: 0, put: 0 },
    workerFetch: 0,
  };
  private readonly leaseMargins: Record<PublisherLeaseCheckpoint, number | null> = {
    claim: null,
    lastPreUpload: null,
    postR2: null,
    postCompletion: null,
    cleanupStart: null,
  };

  constructor(private readonly now: () => number) {}

  recordAcquire(durationMs: number): void {
    this.phaseDurations.acquire = Math.max(0, durationMs);
    this.calls.convex.acquire += 1;
    this.calls.workerFetch += 1;
  }

  observeLease(checkpoint: PublisherLeaseCheckpoint, leaseExpiresAt: number): void {
    const margin = Math.max(0, leaseExpiresAt - this.now());
    const prior = this.leaseMargins[checkpoint];
    this.leaseMargins[checkpoint] = prior === null ? margin : Math.min(prior, margin);
  }

  recordPhase(phase: PublisherPhase, durationMs: number): void {
    this.phaseDurations[phase] = (this.phaseDurations[phase] ?? 0) + Math.max(0, durationMs);
  }

  async phase<T>(phase: PublisherPhase, operation: () => Promise<T>): Promise<T> {
    const startedAt = this.now();
    try {
      return await operation();
    } finally {
      const duration = Math.max(0, this.now() - startedAt);
      this.phaseDurations[phase] = (this.phaseDurations[phase] ?? 0) + duration;
    }
  }

  async convex<T>(operation: PublisherConvexOperation, work: () => Promise<T>): Promise<T> {
    this.calls.convex[operation] += 1;
    this.calls.workerFetch += 1;
    return await this.phase(operation, work);
  }

  async r2<T>(operation: 'head' | 'put', work: () => Promise<T>): Promise<T> {
    this.calls.r2[operation] += 1;
    return await this.phase(operation === 'head' ? 'r2Head' : 'r2Put', work);
  }

  snapshot(): OwnedTelemetrySnapshot {
    const observedMargins = Object.values(this.leaseMargins).filter(
      (value): value is number => value !== null
    );
    return {
      phasesMs: { ...this.phaseDurations },
      logicalCalls: {
        convex: { ...this.calls.convex },
        r2: { ...this.calls.r2 },
        cache: { ...this.calls.cache },
        workerFetch: this.calls.workerFetch,
      },
      minimumLeaseMarginMs: observedMargins.length ? Math.min(...observedMargins) : null,
      leaseMarginsMs: { ...this.leaseMargins },
    };
  }
}
