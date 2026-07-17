export type PromotionPolicy = {
  minimumItems: number;
  minimumFullBatches: number;
  maxCandidateCpuMs: number;
  maxWallMs: number;
  lifecycleDeadlineMs: number;
  maxMemoryBytes: number;
  maxSubrequests: number;
  maxModeledFailureSubrequests: number;
  rollbackSubrequests: number;
  maxBrowserReservationMs: number;
  minimumPreUploadLeaseMs: number;
  maxBrowserCloseMs: number;
  maxSettlementMs: number;
  maxPdfBytes: number;
};

export const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  minimumItems: 20,
  minimumFullBatches: 5,
  maxCandidateCpuMs: 3_000,
  maxWallMs: 360_000,
  lifecycleDeadlineMs: 480_000,
  maxMemoryBytes: 96 * 1024 * 1024,
  maxSubrequests: 35,
  maxModeledFailureSubrequests: 40,
  rollbackSubrequests: 41,
  maxBrowserReservationMs: 120_000,
  minimumPreUploadLeaseMs: 240_000,
  maxBrowserCloseMs: 10_000,
  maxSettlementMs: 5_000,
  maxPdfBytes: 8_000_000,
};

export type PromotionSample = {
  sampleId: string;
  windowSequence: number;
  batchSize: number;
  fullBatch: boolean;
  workerVersionId: string;
  rendererId: string;
  coldBrowserLaunch: boolean;
  failureInjection: boolean;
  recoveryObserved: boolean;
  outcome: 'completed' | 'recoverable_failure' | 'failed' | 'timeout' | 'conflict' | 'quota_denied';
  correctness: {
    exactTerminalCheckpoints: boolean | null;
    duplicateUpload: boolean | null;
    strandedClaimOrSnapshot: boolean | null;
    lostForegroundSave: boolean | null;
    queueOwnedBacklog: boolean | null;
    ownershipFenceFailure: boolean | null;
    conditionalWriteFenceFailure: boolean | null;
  };
  platform: {
    cpuMs: number | null;
    wallMs: number | null;
    memoryBytes: number | null;
    subrequests: number | null;
    invocationOutcome: string | null;
    exceededCpu: boolean;
    exceededMemory: boolean;
  };
  projectedSizeFiveCpuMs: number | null;
  memoryUpwardTrend: boolean | null;
  modeledFailureSubrequests: number | null;
  redirectsKnown: boolean | null;
  browser: {
    sessionMs: number | null;
    closeReason: string | null;
    activeSessionsAfter: number | null;
    reservationMs: number | null;
    accountingAgrees: boolean | null;
  };
  lease: {
    minimumPreUploadRemainingMs: number | null;
    uploadStartedAfterWallGate: boolean | null;
    cleanupCouldCrossExpiry: boolean | null;
  };
  cleanup: {
    closeMs: number | null;
    settlementMs: number | null;
    reservationSettled: boolean | null;
  };
  output: {
    valid: boolean | null;
    pdfBytes: number | null;
    pages: number | null;
    widthMm: number | null;
    heightMm: number | null;
  };
};

export type PromotionRecommendation = 'promote' | 'hold' | 'pause' | 'rollback';

export type PromotionReport = {
  recommendation: PromotionRecommendation;
  currentBatchSize: number;
  candidateBatchSize: number;
  requiredFullBatches: number;
  observedFullBatches: number;
  observedItems: number;
  maxObservedSessionMs: number | null;
  recommendedBrowserReservationMs: number | null;
  rendererId: string | null;
  workerVersionId: string | null;
  missingMetrics: string[];
  invalidMetrics: string[];
  holdReasons: string[];
  pauseTriggers: string[];
  rollbackTriggers: string[];
};

const REQUIRED_METRICS = [
  [
    'correctness.exactTerminalCheckpoints',
    (sample: PromotionSample) => sample.correctness.exactTerminalCheckpoints,
  ],
  ['correctness.duplicateUpload', (sample: PromotionSample) => sample.correctness.duplicateUpload],
  [
    'correctness.strandedClaimOrSnapshot',
    (sample: PromotionSample) => sample.correctness.strandedClaimOrSnapshot,
  ],
  [
    'correctness.lostForegroundSave',
    (sample: PromotionSample) => sample.correctness.lostForegroundSave,
  ],
  [
    'correctness.queueOwnedBacklog',
    (sample: PromotionSample) => sample.correctness.queueOwnedBacklog,
  ],
  [
    'correctness.ownershipFenceFailure',
    (sample: PromotionSample) => sample.correctness.ownershipFenceFailure,
  ],
  [
    'correctness.conditionalWriteFenceFailure',
    (sample: PromotionSample) => sample.correctness.conditionalWriteFenceFailure,
  ],
  ['platform.cpuMs', (sample: PromotionSample) => sample.platform.cpuMs],
  ['platform.wallMs', (sample: PromotionSample) => sample.platform.wallMs],
  ['platform.memoryBytes', (sample: PromotionSample) => sample.platform.memoryBytes],
  ['platform.subrequests', (sample: PromotionSample) => sample.platform.subrequests],
  ['platform.invocationOutcome', (sample: PromotionSample) => sample.platform.invocationOutcome],
  ['projectedSizeFiveCpuMs', (sample: PromotionSample) => sample.projectedSizeFiveCpuMs],
  ['memoryUpwardTrend', (sample: PromotionSample) => sample.memoryUpwardTrend],
  ['modeledFailureSubrequests', (sample: PromotionSample) => sample.modeledFailureSubrequests],
  ['redirectsKnown', (sample: PromotionSample) => sample.redirectsKnown],
  ['browser.sessionMs', (sample: PromotionSample) => sample.browser.sessionMs],
  ['browser.closeReason', (sample: PromotionSample) => sample.browser.closeReason],
  ['browser.activeSessionsAfter', (sample: PromotionSample) => sample.browser.activeSessionsAfter],
  ['browser.reservationMs', (sample: PromotionSample) => sample.browser.reservationMs],
  ['browser.accountingAgrees', (sample: PromotionSample) => sample.browser.accountingAgrees],
  [
    'lease.minimumPreUploadRemainingMs',
    (sample: PromotionSample) => sample.lease.minimumPreUploadRemainingMs,
  ],
  [
    'lease.uploadStartedAfterWallGate',
    (sample: PromotionSample) => sample.lease.uploadStartedAfterWallGate,
  ],
  [
    'lease.cleanupCouldCrossExpiry',
    (sample: PromotionSample) => sample.lease.cleanupCouldCrossExpiry,
  ],
  ['cleanup.closeMs', (sample: PromotionSample) => sample.cleanup.closeMs],
  ['cleanup.settlementMs', (sample: PromotionSample) => sample.cleanup.settlementMs],
  ['cleanup.reservationSettled', (sample: PromotionSample) => sample.cleanup.reservationSettled],
  ['output.valid', (sample: PromotionSample) => sample.output.valid],
  ['output.pdfBytes', (sample: PromotionSample) => sample.output.pdfBytes],
  ['output.pages', (sample: PromotionSample) => sample.output.pages],
  ['output.widthMm', (sample: PromotionSample) => sample.output.widthMm],
  ['output.heightMm', (sample: PromotionSample) => sample.output.heightMm],
] as const;

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

const MAX_EVIDENCE_ID_LENGTH = 128;
const MAX_IDENTITY_LENGTH = 256;

function invalidNumber(
  name: string,
  value: number | null,
  options: { integer?: boolean } = {}
): string[] {
  if (value === null) return [];
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER ||
    (options.integer === true && !Number.isInteger(value))
  ) {
    return [name];
  }
  return [];
}

function invalidBoundedString(name: string, value: unknown, maxLength: number): string[] {
  if (value === null) return [];
  if (typeof value !== 'string') return [name];
  return value.trim().length === 0 || value.length > maxLength ? [name] : [];
}

function invalidBoolean(name: string, value: unknown, nullable = false): string[] {
  return typeof value === 'boolean' || (nullable && value === null) ? [] : [name];
}

export function invalidPromotionMetrics(sample: PromotionSample): string[] {
  const invalid = [
    ...invalidBoundedString('sampleId', sample.sampleId, MAX_EVIDENCE_ID_LENGTH),
    ...invalidNumber('windowSequence', sample.windowSequence, { integer: true }),
    ...invalidBoundedString('workerVersionId', sample.workerVersionId, MAX_IDENTITY_LENGTH),
    ...invalidBoundedString('rendererId', sample.rendererId, MAX_IDENTITY_LENGTH),
    ...invalidNumber('batchSize', sample.batchSize, { integer: true }),
    ...invalidBoolean('fullBatch', sample.fullBatch),
    ...invalidBoolean('coldBrowserLaunch', sample.coldBrowserLaunch),
    ...invalidBoolean('failureInjection', sample.failureInjection),
    ...invalidBoolean('recoveryObserved', sample.recoveryObserved),
    ...invalidBoolean(
      'correctness.exactTerminalCheckpoints',
      sample.correctness.exactTerminalCheckpoints,
      true
    ),
    ...invalidBoolean('correctness.duplicateUpload', sample.correctness.duplicateUpload, true),
    ...invalidBoolean(
      'correctness.strandedClaimOrSnapshot',
      sample.correctness.strandedClaimOrSnapshot,
      true
    ),
    ...invalidBoolean(
      'correctness.lostForegroundSave',
      sample.correctness.lostForegroundSave,
      true
    ),
    ...invalidBoolean('correctness.queueOwnedBacklog', sample.correctness.queueOwnedBacklog, true),
    ...invalidBoolean(
      'correctness.ownershipFenceFailure',
      sample.correctness.ownershipFenceFailure,
      true
    ),
    ...invalidBoolean(
      'correctness.conditionalWriteFenceFailure',
      sample.correctness.conditionalWriteFenceFailure,
      true
    ),
    ...invalidNumber('platform.cpuMs', sample.platform.cpuMs),
    ...invalidNumber('platform.wallMs', sample.platform.wallMs),
    ...invalidNumber('platform.memoryBytes', sample.platform.memoryBytes, { integer: true }),
    ...invalidNumber('platform.subrequests', sample.platform.subrequests, { integer: true }),
    ...invalidBoundedString(
      'platform.invocationOutcome',
      sample.platform.invocationOutcome,
      MAX_EVIDENCE_ID_LENGTH
    ),
    ...invalidBoolean('platform.exceededCpu', sample.platform.exceededCpu),
    ...invalidBoolean('platform.exceededMemory', sample.platform.exceededMemory),
    ...invalidNumber('projectedSizeFiveCpuMs', sample.projectedSizeFiveCpuMs),
    ...invalidBoolean('memoryUpwardTrend', sample.memoryUpwardTrend, true),
    ...invalidNumber('modeledFailureSubrequests', sample.modeledFailureSubrequests, {
      integer: true,
    }),
    ...invalidBoolean('redirectsKnown', sample.redirectsKnown, true),
    ...invalidNumber('browser.sessionMs', sample.browser.sessionMs),
    ...invalidBoundedString(
      'browser.closeReason',
      sample.browser.closeReason,
      MAX_EVIDENCE_ID_LENGTH
    ),
    ...invalidNumber('browser.activeSessionsAfter', sample.browser.activeSessionsAfter, {
      integer: true,
    }),
    ...invalidNumber('browser.reservationMs', sample.browser.reservationMs),
    ...invalidBoolean('browser.accountingAgrees', sample.browser.accountingAgrees, true),
    ...invalidNumber('lease.minimumPreUploadRemainingMs', sample.lease.minimumPreUploadRemainingMs),
    ...invalidBoolean(
      'lease.uploadStartedAfterWallGate',
      sample.lease.uploadStartedAfterWallGate,
      true
    ),
    ...invalidBoolean('lease.cleanupCouldCrossExpiry', sample.lease.cleanupCouldCrossExpiry, true),
    ...invalidNumber('cleanup.closeMs', sample.cleanup.closeMs),
    ...invalidNumber('cleanup.settlementMs', sample.cleanup.settlementMs),
    ...invalidBoolean('cleanup.reservationSettled', sample.cleanup.reservationSettled, true),
    ...invalidBoolean('output.valid', sample.output.valid, true),
    ...invalidNumber('output.pdfBytes', sample.output.pdfBytes, { integer: true }),
    ...invalidNumber('output.pages', sample.output.pages, { integer: true }),
    ...invalidNumber('output.widthMm', sample.output.widthMm),
    ...invalidNumber('output.heightMm', sample.output.heightMm),
  ];
  if (!Number.isInteger(sample.batchSize) || sample.batchSize < 1 || sample.batchSize > 5) {
    invalid.push('batchSize');
  }
  if (
    !['completed', 'recoverable_failure', 'failed', 'timeout', 'conflict', 'quota_denied'].includes(
      sample.outcome
    )
  ) {
    invalid.push('outcome');
  }
  return unique(invalid);
}

export function missingPromotionMetrics(sample: PromotionSample): string[] {
  return REQUIRED_METRICS.flatMap(([name, read]) => {
    const value = read(sample);
    return value === null ||
      (typeof value === 'number' && !Number.isFinite(value)) ||
      (typeof value === 'string' && value.length === 0)
      ? [name]
      : [];
  });
}

function sampleRollbackTriggers(sample: PromotionSample, policy: PromotionPolicy): string[] {
  const triggers: string[] = [];
  const correctness = sample.correctness;
  if (
    correctness.exactTerminalCheckpoints === false ||
    correctness.duplicateUpload === true ||
    correctness.strandedClaimOrSnapshot === true ||
    correctness.lostForegroundSave === true ||
    correctness.queueOwnedBacklog === true ||
    correctness.ownershipFenceFailure === true ||
    correctness.conditionalWriteFenceFailure === true ||
    sample.outcome === 'conflict'
  ) {
    triggers.push(`${sample.sampleId}:correctness_or_fence_failure`);
  }
  if (sample.platform.exceededCpu) triggers.push(`${sample.sampleId}:exceeded_cpu`);
  if (sample.platform.exceededMemory) triggers.push(`${sample.sampleId}:exceeded_memory`);
  if (sample.platform.memoryBytes !== null && sample.platform.memoryBytes > policy.maxMemoryBytes) {
    triggers.push(`${sample.sampleId}:memory_above_limit`);
  }
  if (sample.memoryUpwardTrend === true) triggers.push(`${sample.sampleId}:memory_upward_trend`);
  if (sample.platform.wallMs !== null && sample.platform.wallMs >= policy.lifecycleDeadlineMs) {
    triggers.push(`${sample.sampleId}:lifecycle_deadline`);
  }
  if (sample.outcome === 'timeout') triggers.push(`${sample.sampleId}:timeout`);
  if (
    sample.platform.subrequests !== null &&
    sample.platform.subrequests >= policy.rollbackSubrequests
  ) {
    triggers.push(`${sample.sampleId}:subrequest_rollback_threshold`);
  }
  if (sample.redirectsKnown === false) triggers.push(`${sample.sampleId}:redirect_count_uncertain`);
  if (sample.browser.closeReason !== null && sample.browser.closeReason !== 'NormalClosure') {
    triggers.push(`${sample.sampleId}:abnormal_browser_close`);
  }
  if (sample.browser.activeSessionsAfter !== null && sample.browser.activeSessionsAfter !== 0) {
    triggers.push(`${sample.sampleId}:browser_session_leak`);
  }
  if (sample.browser.accountingAgrees === false) {
    triggers.push(`${sample.sampleId}:browser_accounting_disagreement`);
  }
  if (
    sample.browser.reservationMs !== null &&
    sample.browser.reservationMs > policy.maxBrowserReservationMs
  ) {
    triggers.push(`${sample.sampleId}:browser_reservation_above_limit`);
  }
  if (
    sample.lease.minimumPreUploadRemainingMs !== null &&
    sample.lease.minimumPreUploadRemainingMs < policy.minimumPreUploadLeaseMs
  ) {
    triggers.push(`${sample.sampleId}:insufficient_preupload_lease`);
  }
  if (sample.lease.uploadStartedAfterWallGate === true) {
    triggers.push(`${sample.sampleId}:upload_after_wall_gate`);
  }
  if (sample.lease.cleanupCouldCrossExpiry === true) {
    triggers.push(`${sample.sampleId}:cleanup_may_cross_lease`);
  }
  if (sample.cleanup.closeMs !== null && sample.cleanup.closeMs > policy.maxBrowserCloseMs) {
    triggers.push(`${sample.sampleId}:browser_close_above_limit`);
  }
  if (
    sample.cleanup.settlementMs !== null &&
    sample.cleanup.settlementMs > policy.maxSettlementMs
  ) {
    triggers.push(`${sample.sampleId}:settlement_above_limit`);
  }
  if (sample.cleanup.reservationSettled === false) {
    triggers.push(`${sample.sampleId}:unsettled_reservation`);
  }
  if (
    sample.output.valid === false ||
    (sample.output.pdfBytes !== null && sample.output.pdfBytes > policy.maxPdfBytes) ||
    (sample.output.pages !== null && sample.output.pages !== 2) ||
    (sample.output.widthMm !== null && Math.abs(sample.output.widthMm - 150) > 0.5) ||
    (sample.output.heightMm !== null && Math.abs(sample.output.heightMm - 195) > 0.5)
  ) {
    triggers.push(`${sample.sampleId}:invalid_output`);
  }
  return triggers;
}

function sampleHoldReasons(sample: PromotionSample, policy: PromotionPolicy): string[] {
  const reasons: string[] = [];
  if (sample.platform.cpuMs !== null && sample.platform.cpuMs > policy.maxCandidateCpuMs) {
    reasons.push(`${sample.sampleId}:cpu_above_promotion_gate`);
  }
  if (
    sample.projectedSizeFiveCpuMs !== null &&
    sample.projectedSizeFiveCpuMs > policy.maxCandidateCpuMs
  ) {
    reasons.push(`${sample.sampleId}:projected_size_five_cpu_above_gate`);
  }
  if (sample.platform.wallMs !== null && sample.platform.wallMs > policy.maxWallMs) {
    reasons.push(`${sample.sampleId}:wall_above_promotion_gate`);
  }
  if (sample.platform.subrequests !== null && sample.platform.subrequests > policy.maxSubrequests) {
    reasons.push(`${sample.sampleId}:subrequests_above_promotion_gate`);
  }
  if (
    sample.modeledFailureSubrequests !== null &&
    sample.modeledFailureSubrequests > policy.maxModeledFailureSubrequests
  ) {
    reasons.push(`${sample.sampleId}:modeled_failure_subrequests_above_gate`);
  }
  if (sample.outcome === 'failed') reasons.push(`${sample.sampleId}:unclassified_failure`);
  return reasons;
}

export function evaluateBatchPromotion(input: {
  currentBatchSize: number;
  candidateBatchSize: number;
  samples: PromotionSample[];
  ownershipFailureSuitePassed: boolean;
  policy?: PromotionPolicy;
}): PromotionReport {
  const policy = input.policy ?? DEFAULT_PROMOTION_POLICY;
  const seenSampleIds = new Set<string>();
  const duplicateSampleIds = new Set<string>();
  const distinctSamples = input.samples.filter((sample) => {
    if (seenSampleIds.has(sample.sampleId)) {
      duplicateSampleIds.add(sample.sampleId);
      return false;
    }
    seenSampleIds.add(sample.sampleId);
    return true;
  });
  const seenWindowSequences = new Set<number>();
  const duplicateWindowSequences = new Set<number>();
  for (const sample of distinctSamples) {
    if (seenWindowSequences.has(sample.windowSequence)) {
      duplicateWindowSequences.add(sample.windowSequence);
    }
    seenWindowSequences.add(sample.windowSequence);
  }
  const candidateIsValid =
    Number.isInteger(input.candidateBatchSize) &&
    input.candidateBatchSize >= 2 &&
    input.candidateBatchSize <= 5;
  const requiredFullBatches = Math.max(
    policy.minimumFullBatches,
    Math.ceil(policy.minimumItems / Math.max(1, input.candidateBatchSize))
  );
  const candidateSamples = distinctSamples
    .filter((sample) => sample.batchSize === input.candidateBatchSize)
    .sort((left, right) => {
      const leftSequence = Number.isSafeInteger(left.windowSequence)
        ? left.windowSequence
        : Number.MAX_SAFE_INTEGER;
      const rightSequence = Number.isSafeInteger(right.windowSequence)
        ? right.windowSequence
        : Number.MAX_SAFE_INTEGER;
      return leftSequence - rightSequence || left.sampleId.localeCompare(right.sampleId);
    });
  const fullSamples = candidateSamples.filter(
    (sample) => sample.batchSize === input.candidateBatchSize && sample.fullBatch
  );
  const observedBrowserSessions = candidateSamples.flatMap((sample) => {
    const value = sample.browser.sessionMs;
    return value !== null &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER
      ? [value]
      : [];
  });
  const maxObservedSessionMs = observedBrowserSessions.length
    ? Math.max(...observedBrowserSessions)
    : null;
  const recommendedBrowserReservationMs =
    maxObservedSessionMs === null
      ? null
      : Math.ceil((1.25 * maxObservedSessionMs + 5_000) / 1_000) * 1_000;
  const missingMetrics = unique(
    distinctSamples.flatMap((sample) =>
      missingPromotionMetrics(sample).map((metric) => `${sample.sampleId}:${metric}`)
    )
  );
  const invalidMetrics = unique([
    ...distinctSamples.flatMap((sample) =>
      invalidPromotionMetrics(sample).map((metric) => `${sample.sampleId}:${metric}`)
    ),
    ...Array.from(duplicateSampleIds, (sampleId) => `${sampleId}:duplicate_sample_id`),
    ...Array.from(
      duplicateWindowSequences,
      (sequence) => `window-${sequence}:duplicate_window_sequence`
    ),
    ...(typeof input.ownershipFailureSuitePassed === 'boolean'
      ? []
      : ['promotion:ownershipFailureSuitePassed']),
  ]);
  const rollbackTriggers = unique(
    candidateSamples.flatMap((sample) => sampleRollbackTriggers(sample, policy))
  );
  if (
    recommendedBrowserReservationMs !== null &&
    recommendedBrowserReservationMs > policy.maxBrowserReservationMs
  ) {
    rollbackTriggers.push('computed_browser_reservation_above_limit');
  }
  for (let index = 1; index < candidateSamples.length; index += 1) {
    const previous = candidateSamples[index - 1];
    const current = candidateSamples[index];
    if (
      previous &&
      current &&
      previous.platform.cpuMs !== null &&
      current.platform.cpuMs !== null &&
      previous.platform.cpuMs > policy.maxCandidateCpuMs &&
      current.platform.cpuMs > policy.maxCandidateCpuMs
    ) {
      rollbackTriggers.push('two_consecutive_cpu_windows_above_limit');
      break;
    }
  }
  const pauseTriggers = unique(
    candidateSamples.flatMap((sample) =>
      sample.outcome === 'quota_denied' ? [`${sample.sampleId}:quota_denied`] : []
    )
  );
  const holdReasons = candidateSamples.flatMap((sample) => sampleHoldReasons(sample, policy));
  if (input.candidateBatchSize !== input.currentBatchSize + 1 || input.candidateBatchSize > 5) {
    holdReasons.push('candidate_must_be_the_next_step_at_or_below_five');
  }
  if (!candidateIsValid) holdReasons.push('candidate_batch_size_is_invalid');
  if (
    !Number.isInteger(input.currentBatchSize) ||
    input.currentBatchSize < 1 ||
    input.currentBatchSize > 4
  ) {
    holdReasons.push('current_batch_size_is_invalid');
  }
  if (fullSamples.length < requiredFullBatches) holdReasons.push('minimum_full_batches_not_met');
  if (fullSamples.length * input.candidateBatchSize < policy.minimumItems) {
    holdReasons.push('minimum_item_count_not_met');
  }
  if (input.ownershipFailureSuitePassed !== true) {
    holdReasons.push('ownership_failure_suite_not_passed');
  }
  if (!fullSamples.some((sample) => sample.coldBrowserLaunch)) {
    holdReasons.push('cold_browser_launch_not_observed');
  }
  if (
    !candidateSamples.some(
      (sample) =>
        sample.failureInjection &&
        sample.recoveryObserved &&
        sample.outcome === 'recoverable_failure'
    )
  ) {
    holdReasons.push('injected_failure_recovery_not_observed');
  }
  const rendererIds = unique(candidateSamples.map((sample) => sample.rendererId));
  const workerVersionIds = unique(candidateSamples.map((sample) => sample.workerVersionId));
  if (rendererIds.length !== 1) holdReasons.push('samples_do_not_share_one_renderer_identity');
  if (workerVersionIds.length !== 1) holdReasons.push('samples_do_not_share_one_worker_identity');
  if (
    candidateSamples.some(
      (sample) => !/^faction-sheet\/sha256:[0-9a-f]{64}$/.test(sample.rendererId)
    )
  ) {
    holdReasons.push('renderer_identity_is_not_an_immutable_manifest_digest');
  }
  if (candidateSamples.some((sample) => sample.workerVersionId.length === 0)) {
    holdReasons.push('worker_identity_is_missing');
  }
  if (input.samples.some((sample) => sample.batchSize !== input.candidateBatchSize)) {
    holdReasons.push('sample_batch_size_mismatch');
  }
  if (missingMetrics.length) holdReasons.push('required_metrics_missing');
  if (invalidMetrics.length) holdReasons.push('invalid_metric_domain');

  const recommendation: PromotionRecommendation = rollbackTriggers.length
    ? 'rollback'
    : pauseTriggers.length
      ? 'pause'
      : holdReasons.length
        ? 'hold'
        : 'promote';
  return {
    recommendation,
    currentBatchSize: input.currentBatchSize,
    candidateBatchSize: input.candidateBatchSize,
    requiredFullBatches,
    observedFullBatches: fullSamples.length,
    observedItems: fullSamples.length * input.candidateBatchSize,
    maxObservedSessionMs,
    recommendedBrowserReservationMs,
    rendererId: rendererIds.length === 1 ? (rendererIds[0] ?? null) : null,
    workerVersionId: workerVersionIds.length === 1 ? (workerVersionIds[0] ?? null) : null,
    missingMetrics,
    invalidMetrics,
    holdReasons: unique(holdReasons),
    pauseTriggers,
    rollbackTriggers: unique(rollbackTriggers),
  };
}

export function formatPromotionReport(report: PromotionReport): string {
  const list = (values: string[]) => (values.length ? values.join(', ') : 'none');
  return [
    `Recommendation: ${report.recommendation}`,
    `Step: ${report.currentBatchSize} -> ${report.candidateBatchSize}`,
    `Full batches: ${report.observedFullBatches}/${report.requiredFullBatches}`,
    `Observed items: ${report.observedItems}`,
    `Maximum observed Browser session: ${
      report.maxObservedSessionMs === null ? 'unverified' : `${report.maxObservedSessionMs} ms`
    }`,
    `Recommended Browser reservation: ${
      report.recommendedBrowserReservationMs === null
        ? 'unverified'
        : `${report.recommendedBrowserReservationMs} ms`
    }`,
    `Renderer: ${report.rendererId ?? 'unverified'}`,
    `Worker: ${report.workerVersionId ?? 'unverified'}`,
    `Missing metrics: ${list(report.missingMetrics)}`,
    `Invalid metrics: ${list(report.invalidMetrics)}`,
    `Hold reasons: ${list(report.holdReasons)}`,
    `Pause triggers: ${list(report.pauseTriggers)}`,
    `Rollback triggers: ${list(report.rollbackTriggers)}`,
  ].join('\n');
}

export const TICKET_1_OBSERVED_SAMPLE: PromotionSample = {
  sampleId: 'ticket-1-observed-one-item',
  windowSequence: 0,
  batchSize: 1,
  fullBatch: true,
  workerVersionId: 'fd6add18-c7cb-49f5-865c-fe7b85f2203d',
  rendererId: 'ticket-1-proof-renderer',
  coldBrowserLaunch: true,
  failureInjection: false,
  recoveryObserved: false,
  outcome: 'completed',
  correctness: {
    exactTerminalCheckpoints: null,
    duplicateUpload: null,
    strandedClaimOrSnapshot: null,
    lostForegroundSave: null,
    queueOwnedBacklog: null,
    ownershipFenceFailure: null,
    conditionalWriteFenceFailure: null,
  },
  platform: {
    cpuMs: 270,
    wallMs: 9_114,
    memoryBytes: null,
    subrequests: null,
    invocationOutcome: 'ok',
    exceededCpu: false,
    exceededMemory: false,
  },
  projectedSizeFiveCpuMs: null,
  memoryUpwardTrend: null,
  modeledFailureSubrequests: null,
  redirectsKnown: null,
  browser: {
    sessionMs: 8_170,
    closeReason: 'NormalClosure',
    activeSessionsAfter: 0,
    reservationMs: null,
    accountingAgrees: null,
  },
  lease: {
    minimumPreUploadRemainingMs: null,
    uploadStartedAfterWallGate: null,
    cleanupCouldCrossExpiry: null,
  },
  cleanup: { closeMs: null, settlementMs: null, reservationSettled: null },
  output: {
    valid: true,
    pdfBytes: 107_792,
    pages: 2,
    widthMm: 149.9447,
    heightMm: 195.072,
  },
};
