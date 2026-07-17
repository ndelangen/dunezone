import { describe, expect, test } from 'vitest';

import {
  DEFAULT_PROMOTION_POLICY,
  evaluateBatchPromotion,
  formatPromotionReport,
  type PromotionSample,
  TICKET_1_OBSERVED_SAMPLE,
} from './promotion';

function sample(
  id: string,
  batchSize: number,
  overrides: Partial<PromotionSample> = {}
): PromotionSample {
  const windowSequence = Array.from(id).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) % 1_000_000_000,
    0
  );
  return {
    sampleId: id,
    windowSequence,
    batchSize,
    fullBatch: true,
    workerVersionId: 'worker-version-one',
    rendererId: `faction-sheet/sha256:${'a'.repeat(64)}`,
    coldBrowserLaunch: id === 'sample-1',
    failureInjection: false,
    recoveryObserved: false,
    outcome: 'completed',
    correctness: {
      exactTerminalCheckpoints: true,
      duplicateUpload: false,
      strandedClaimOrSnapshot: false,
      lostForegroundSave: false,
      queueOwnedBacklog: false,
      ownershipFenceFailure: false,
      conditionalWriteFenceFailure: false,
    },
    platform: {
      cpuMs: 500,
      wallMs: 20_000,
      memoryBytes: 40 * 1024 * 1024,
      subrequests: 12,
      invocationOutcome: 'ok',
      exceededCpu: false,
      exceededMemory: false,
    },
    projectedSizeFiveCpuMs: 2_000,
    memoryUpwardTrend: false,
    modeledFailureSubrequests: 20,
    redirectsKnown: true,
    browser: {
      sessionMs: 10_000,
      closeReason: 'NormalClosure',
      activeSessionsAfter: 0,
      reservationMs: 18_000,
      accountingAgrees: true,
    },
    lease: {
      minimumPreUploadRemainingMs: 300_000,
      uploadStartedAfterWallGate: false,
      cleanupCouldCrossExpiry: false,
    },
    cleanup: { closeMs: 500, settlementMs: 100, reservationSettled: true },
    output: { valid: true, pdfBytes: 107_792, pages: 2, widthMm: 150, heightMm: 195 },
    ...overrides,
  };
}

function passingSamples(batchSize: number): PromotionSample[] {
  const count = Math.max(5, Math.ceil(20 / batchSize));
  return Array.from({ length: count }, (_, index) =>
    sample(`sample-${index + 1}`, batchSize, {
      ...(index === count - 1
        ? {
            failureInjection: true,
            recoveryObserved: true,
            outcome: 'recoverable_failure' as const,
          }
        : {}),
    })
  );
}

describe('pure one-step batch promotion policy', () => {
  test.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ])('recommends only the measured %i -> %i step', (currentBatchSize, candidateBatchSize) => {
    const report = evaluateBatchPromotion({
      currentBatchSize,
      candidateBatchSize,
      samples: passingSamples(candidateBatchSize),
      ownershipFailureSuitePassed: true,
    });
    expect(report.recommendation).toBe('promote');
    expect(report.observedFullBatches).toBe(report.requiredFullBatches);
    expect(report.recommendedBrowserReservationMs).toBe(18_000);
  });

  test('a recoverable injected item failure is evidence only after exact recovery', () => {
    const samples = passingSamples(2);
    const recovered = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples,
      ownershipFailureSuitePassed: true,
    });
    expect(recovered.recommendation).toBe('promote');

    samples[samples.length - 1] = sample('failed-without-recovery', 2, {
      outcome: 'failed',
      failureInjection: true,
      recoveryObserved: false,
    });
    expect(
      evaluateBatchPromotion({
        currentBatchSize: 1,
        candidateBatchSize: 2,
        samples,
        ownershipFailureSuitePassed: true,
      })
    ).toMatchObject({ recommendation: 'hold' });
  });

  test('timeout and conditional conflict samples trigger rollback', () => {
    for (const failing of [
      sample('timeout', 2, { outcome: 'timeout' }),
      sample('conflict', 2, {
        outcome: 'conflict',
        correctness: {
          ...sample('base', 2).correctness,
          conditionalWriteFenceFailure: true,
        },
      }),
    ]) {
      const report = evaluateBatchPromotion({
        currentBatchSize: 1,
        candidateBatchSize: 2,
        samples: [...passingSamples(2), failing],
        ownershipFailureSuitePassed: true,
      });
      expect(report.recommendation).toBe('rollback');
    }
  });

  test('quota denial pauses without pretending the candidate is unsafe', () => {
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples: [...passingSamples(2), sample('quota', 2, { outcome: 'quota_denied' })],
      ownershipFailureSuitePassed: true,
    });
    expect(report.recommendation).toBe('pause');
    expect(report.pauseTriggers).toEqual(['quota:quota_denied']);
  });

  test('accepts the observed 3,698,605-byte PDF but rejects evidence above 8,000,000 bytes', () => {
    const accepted = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples: passingSamples(2).map((entry) => ({
        ...entry,
        output: { ...entry.output, pdfBytes: 3_698_605 },
      })),
      ownershipFailureSuitePassed: true,
    });
    expect(accepted.recommendation).toBe('promote');

    const oversized = passingSamples(2);
    oversized[0] = sample('oversized-pdf', 2, {
      output: { ...sample('base', 2).output, pdfBytes: 8_000_001 },
    });
    const rejected = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples: oversized,
      ownershipFailureSuitePassed: true,
    });
    expect(rejected.recommendation).toBe('rollback');
    expect(rejected.rollbackTriggers).toContain('oversized-pdf:invalid_output');
  });

  test('missing platform metrics always prevent promotion', () => {
    const samples = passingSamples(2);
    samples[0] = sample('missing-cpu', 2, {
      platform: { ...sample('base', 2).platform, cpuMs: null },
    });
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples,
      ownershipFailureSuitePassed: true,
    });
    expect(report.recommendation).toBe('hold');
    expect(report.missingMetrics).toContain('missing-cpu:platform.cpuMs');
    expect(formatPromotionReport(report)).toContain('Recommendation: hold');
  });

  test('duplicate evidence windows never satisfy the minimum sample gate', () => {
    const oneObservation = sample('one-observation', 2, {
      failureInjection: true,
      recoveryObserved: true,
      outcome: 'recoverable_failure',
    });
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples: Array.from({ length: 10 }, () => oneObservation),
      ownershipFailureSuitePassed: true,
    });
    expect(report).toMatchObject({ recommendation: 'hold', observedFullBatches: 1 });
    expect(report.invalidMetrics).toContain('one-observation:duplicate_sample_id');
    expect(report.holdReasons).toContain('invalid_metric_domain');
  });

  test('partial and failure samples share the cohort and Browser reservation maximum', () => {
    const samples = passingSamples(2);
    samples.push(
      sample('slow-partial-recovery', 2, {
        fullBatch: false,
        failureInjection: true,
        recoveryObserved: true,
        outcome: 'recoverable_failure',
        browser: { ...sample('base', 2).browser, sessionMs: 100_000 },
      })
    );
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples,
      ownershipFailureSuitePassed: true,
    });
    expect(report.maxObservedSessionMs).toBe(100_000);
    expect(report.recommendedBrowserReservationMs).toBe(130_000);
    expect(report.recommendation).toBe('rollback');
    expect(report.rollbackTriggers).toContain('computed_browser_reservation_above_limit');

    samples[samples.length - 1] = sample('cross-worker-failure', 2, {
      fullBatch: false,
      workerVersionId: 'worker-version-two',
      failureInjection: true,
      recoveryObserved: true,
      outcome: 'recoverable_failure',
    });
    const mismatched = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples,
      ownershipFailureSuitePassed: true,
    });
    expect(mismatched.recommendation).toBe('hold');
    expect(mismatched.holdReasons).toContain('samples_do_not_share_one_worker_identity');
  });

  test('negative, fractional integer, and overflow measurements fail closed', () => {
    const samples = passingSamples(2);
    samples[0] = sample('impossible-metrics', 2, {
      platform: {
        ...sample('base', 2).platform,
        cpuMs: -1,
        wallMs: -1,
        memoryBytes: Number.MAX_VALUE,
        subrequests: 1.5,
      },
      browser: {
        ...sample('base', 2).browser,
        sessionMs: -1,
        activeSessionsAfter: 0.5,
        reservationMs: -1,
      },
      lease: { ...sample('base', 2).lease, minimumPreUploadRemainingMs: -1 },
      cleanup: { ...sample('base', 2).cleanup, closeMs: -1, settlementMs: -1 },
      output: {
        ...sample('base', 2).output,
        pdfBytes: -1,
        pages: 2.5,
        widthMm: -1,
        heightMm: -1,
      },
    });
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples,
      ownershipFailureSuitePassed: true,
    });
    expect(report.recommendation).not.toBe('promote');
    expect(report.holdReasons).toContain('invalid_metric_domain');
    expect(report.invalidMetrics).toEqual(
      expect.arrayContaining([
        'impossible-metrics:platform.cpuMs',
        'impossible-metrics:platform.memoryBytes',
        'impossible-metrics:platform.subrequests',
        'impossible-metrics:browser.sessionMs',
        'impossible-metrics:output.pages',
      ])
    );
  });

  test('oversized evidence identities and malformed runtime domains fail closed', () => {
    const samples = passingSamples(2);
    samples[0] = sample('x'.repeat(129), 2, {
      fullBatch: 'yes' as never,
      outcome: 'unknown' as never,
    });
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples,
      ownershipFailureSuitePassed: true,
    });
    expect(report.recommendation).not.toBe('promote');
    expect(report.invalidMetrics).toEqual(
      expect.arrayContaining([
        `${'x'.repeat(129)}:sampleId`,
        `${'x'.repeat(129)}:fullBatch`,
        `${'x'.repeat(129)}:outcome`,
      ])
    );
  });

  test.each([
    'false',
    1,
    null,
    {},
  ])('ownership failure-suite result %j cannot satisfy the exact boolean gate', (malformed) => {
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples: passingSamples(2),
      ownershipFailureSuitePassed: malformed as never,
    });
    expect(report.recommendation).toBe('hold');
    expect(report.holdReasons).toContain('ownership_failure_suite_not_passed');
    expect(report.invalidMetrics).toContain('promotion:ownershipFailureSuitePassed');
  });

  test.each([
    'exactTerminalCheckpoints',
    'duplicateUpload',
    'strandedClaimOrSnapshot',
    'lostForegroundSave',
    'queueOwnedBacklog',
    'ownershipFenceFailure',
    'conditionalWriteFenceFailure',
  ] as const)('correctness.%s requires an exact boolean', (field) => {
    const samples = passingSamples(2);
    const first = samples[0] as PromotionSample;
    samples[0] = {
      ...first,
      correctness: { ...first.correctness, [field]: 'false' as never },
    };
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples,
      ownershipFailureSuitePassed: true,
    });
    expect(report.recommendation).toBe('hold');
    expect(report.invalidMetrics).toContain(`${first.sampleId}:correctness.${field}`);
  });

  test('consecutive CPU rollback uses validated window chronology, not caller order', () => {
    const samples = passingSamples(2).map((entry, index) => ({
      ...entry,
      windowSequence: index + 1,
      ...(index === 3 || index === 4 ? { platform: { ...entry.platform, cpuMs: 3_100 } } : {}),
    }));
    const forward = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples,
      ownershipFailureSuitePassed: true,
    });
    const reordered = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples: [samples[4] as PromotionSample, ...samples.slice(0, 4), ...samples.slice(5)],
      ownershipFailureSuitePassed: true,
    });
    expect(forward.rollbackTriggers).toContain('two_consecutive_cpu_windows_above_limit');
    expect(reordered).toEqual(forward);
  });

  test('duplicate chronological windows fail closed', () => {
    const samples = passingSamples(2);
    samples[1] = { ...(samples[1] as PromotionSample), windowSequence: samples[0]?.windowSequence };
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples,
      ownershipFailureSuitePassed: true,
    });
    expect(report.recommendation).toBe('hold');
    expect(report.invalidMetrics).toContain(
      `window-${samples[0]?.windowSequence}:duplicate_window_sequence`
    );
  });

  test('Ticket 1 evidence is correctly classified as useful but insufficient for 1 -> 2', () => {
    const report = evaluateBatchPromotion({
      currentBatchSize: 1,
      candidateBatchSize: 2,
      samples: [TICKET_1_OBSERVED_SAMPLE],
      ownershipFailureSuitePassed: true,
      policy: DEFAULT_PROMOTION_POLICY,
    });
    expect(report.recommendation).toBe('hold');
    expect(report.holdReasons).toContain('sample_batch_size_mismatch');
    expect(report.holdReasons).toContain('required_metrics_missing');
    expect(report.missingMetrics).toContain('ticket-1-observed-one-item:platform.memoryBytes');
    expect(report.missingMetrics).toContain(
      'ticket-1-observed-one-item:correctness.exactTerminalCheckpoints'
    );
  });
});
