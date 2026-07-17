import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  BROWSER_CLEANUP_GRACE_MS,
  type CapturedPdf,
  executeOnePdfProof,
  MAX_BROWSER_CAPTURE_DEADLINE_MS,
  type ProofBrowser,
  type ProofCheckpoint,
  type ProofFailureMode,
} from './core';
import { createProofWakeUp } from './dispatch';
import { inspectChromiumPdf } from './pdf';
import { incompleteClassicXrefPdf } from './pdf-test-fixtures';
import { ProofQueueConsumer } from './queue';

const validCapture: CapturedPdf = {
  bytes: new Uint8Array([37, 80, 68, 70]),
  pageCount: 2,
  pageWidthMm: 210,
  pageHeightMm: 297,
  consoleErrors: [],
  requestFailures: [],
};

function harness(
  failureMode: ProofFailureMode,
  capture: (timeoutMs: number) => Promise<CapturedPdf> = async () => validCapture,
  close: () => Promise<void> = async () => undefined,
  checkpointEffect: (checkpoint: ProofCheckpoint) => Promise<void> = async () => undefined,
  uploadEffect: (key: string) => Promise<void> = async () => undefined
) {
  let time = 0;
  let monotonicTime = 0;
  const checkpoints: ProofCheckpoint[] = [];
  const uploads: string[] = [];
  const browser: ProofBrowser = { capture, close };

  return {
    checkpoints,
    uploads,
    run: (renderTimeoutMs = 45_000) =>
      executeOnePdfProof(
        {
          now: () => {
            time += 10;
            return time;
          },
          monotonicNow: () => {
            monotonicTime += 5;
            return monotonicTime;
          },
          randomUUID: () => '2f521370-9f5c-49c0-b2d9-5616091bbd25',
          openBrowser: async () => browser,
          checkpoint: async (checkpoint) => {
            checkpoints.push(checkpoint);
            await checkpointEffect(checkpoint);
          },
          uploadPdf: async (key) => {
            await uploadEffect(key);
            uploads.push(key);
          },
        },
        { failureMode, renderTimeoutMs }
      ),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('executeOnePdfProof', () => {
  test('reserves explicit cleanup margin before the then-planned eight-minute soft budget', () => {
    expect(MAX_BROWSER_CAPTURE_DEADLINE_MS + BROWSER_CLEANUP_GRACE_MS).toBeLessThan(480_000);
  });

  test('checkpoints, uploads exactly one PDF, and closes the browser on success', async () => {
    const close = vi.fn(async () => undefined);
    const proof = harness('none', async () => validCapture, close);

    const report = await proof.run();

    expect(report).toMatchObject({
      outcome: 'success',
      browserCloseOutcome: 'closed',
      pdfBytes: validCapture.bytes.byteLength,
      pageCount: 2,
      r2Operations: 1,
      convexCalls: 2,
      convexBeforeCheckpointLatencyMs: 5,
      convexAfterCheckpointLatencyMs: 5,
    });
    expect(proof.uploads).toEqual(['proof/faction-sheet.pdf']);
    expect(proof.checkpoints.map(({ phase, outcome }) => ({ phase, outcome }))).toEqual([
      { phase: 'before_capture', outcome: 'started' },
      { phase: 'after_capture', outcome: 'success' },
    ]);
    expect(close).toHaveBeenCalledWith();
  });

  test('actively closes a capture that never resolves until cancellation', async () => {
    vi.useFakeTimers();
    let rejectCapture: ((error: Error) => void) | undefined;
    const capture = vi.fn(
      async () =>
        await new Promise<CapturedPdf>((_resolve, reject) => {
          rejectCapture = reject;
        })
    );
    const close = vi.fn(async () => {
      rejectCapture?.(new Error('page.pdf cancelled by browser closure'));
    });
    const proof = harness('none', capture, close);

    const reportPromise = proof.run(100);
    await vi.advanceTimersByTimeAsync(100);
    const report = await reportPromise;

    expect(report).toMatchObject({
      outcome: 'failed',
      browserCloseOutcome: 'closed',
      r2Operations: 0,
      error: 'Browser capture exceeded the 100 ms end-to-end deadline',
    });
    expect(proof.uploads).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
    expect(proof.checkpoints.at(-1)?.outcome).toBe('failed');
  });

  test('reports cleanup timeout instead of waiting for the Queue wall limit', async () => {
    vi.useFakeTimers();
    const capture = vi.fn(async () => await new Promise<CapturedPdf>(() => undefined));
    const close = vi.fn(async () => await new Promise<void>(() => undefined));
    const proof = harness('none', capture, close);

    const reportPromise = proof.run(100);
    await vi.advanceTimersByTimeAsync(100 + BROWSER_CLEANUP_GRACE_MS);
    const report = await reportPromise;

    expect(report).toMatchObject({
      outcome: 'failed',
      browserCloseOutcome: 'cleanup_timed_out',
      r2Operations: 0,
      error: `Browser capture exceeded the 100 ms end-to-end deadline; Browser cleanup after capture timeout did not finish within ${BROWSER_CLEANUP_GRACE_MS} ms`,
    });
    expect(close).toHaveBeenCalledOnce();
    expect(proof.checkpoints.at(-1)?.outcome).toBe('failed');
  });

  test('bounds final close after R2 and acks the handled failure without Queue retry', async () => {
    vi.useFakeTimers();
    const close = vi.fn(async () => await new Promise<void>(() => undefined));
    const proof = harness('none', async () => validCapture, close);
    const ack = vi.fn();
    const retry = vi.fn();
    const message = {
      id: 'queue-message',
      attempts: 1,
      body: createProofWakeUp(
        Date.parse('2026-07-16T12:00:00.000Z'),
        '10a5318c-e0f2-49c6-bd19-5221a80643f7'
      ),
      ack,
      retry,
    };
    const consumer = new ProofQueueConsumer(vi.fn());
    let report: Awaited<ReturnType<typeof proof.run>> | undefined;

    const consumePromise = consumer.consume(
      message,
      async () => true,
      async () => {
        report = await proof.run();
        return report;
      }
    );
    await vi.advanceTimersByTimeAsync(BROWSER_CLEANUP_GRACE_MS);
    await expect(consumePromise).resolves.toEqual({ action: 'ack', reason: 'failed' });

    expect(report).toMatchObject({
      outcome: 'failed',
      browserCloseOutcome: 'cleanup_timed_out',
      r2Operations: 1,
      error: `Browser cleanup after proof execution did not finish within ${BROWSER_CLEANUP_GRACE_MS} ms`,
    });
    expect(proof.uploads).toEqual(['proof/faction-sheet.pdf']);
    expect(proof.checkpoints.at(-1)?.outcome).toBe('failed');
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  test('a reporting-path error after capture leaves R2 untouched', async () => {
    const proof = harness('reporting_error_after_capture');

    const report = await proof.run();

    expect(report).toMatchObject({
      outcome: 'failed',
      r2Operations: 0,
      error: 'Injected reporting-path error after capture and before R2 upload',
    });
    expect(proof.uploads).toEqual([]);
    expect(proof.checkpoints.at(-1)?.outcome).toBe('failed');
  });

  test('an invalid PDF contract produces no false success or R2 write', async () => {
    const proof = harness('none', async () => ({ ...validCapture, pageCount: 1 }));

    const report = await proof.run();

    expect(report).toMatchObject({
      outcome: 'failed',
      r2Operations: 0,
      error: 'Expected 2 PDF pages, received 1',
    });
    expect(proof.uploads).toEqual([]);
    expect(proof.checkpoints.at(-1)?.outcome).toBe('failed');
  });

  test('a real parser rejection never uploads or checkpoints success', async () => {
    const proof = harness('none', async () => {
      throw new Error('PDF parser rejected browser output: invalid xref');
    });

    const report = await proof.run();

    expect(report).toMatchObject({
      outcome: 'failed',
      r2Operations: 0,
      error: 'PDF parser rejected browser output: invalid xref',
    });
    expect(proof.uploads).toEqual([]);
    expect(proof.checkpoints.at(-1)?.outcome).toBe('failed');
  });

  test('a repaired but unindexed page tree never uploads or checkpoints success', async () => {
    const proof = harness('none', async () => {
      await inspectChromiumPdf(incompleteClassicXrefPdf());
      return validCapture;
    });

    const report = await proof.run();

    expect(report).toMatchObject({
      outcome: 'failed',
      r2Operations: 0,
      error: 'Classic xref does not contain exactly trailer Size entries',
    });
    expect(proof.uploads).toEqual([]);
    expect(proof.checkpoints.at(-1)?.outcome).toBe('failed');
  });

  test('an R2 failure produces no false success and still closes the browser', async () => {
    const close = vi.fn(async () => undefined);
    const proof = harness(
      'none',
      async () => validCapture,
      close,
      async () => undefined,
      async () => {
        throw new Error('R2 put failed');
      }
    );

    const report = await proof.run();

    expect(report).toMatchObject({ outcome: 'failed', r2Operations: 1, error: 'R2 put failed' });
    expect(proof.uploads).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
    expect(proof.checkpoints.at(-1)?.outcome).toBe('failed');
  });

  test('reports a real browser close rejection without losing upload metrics', async () => {
    const proof = harness(
      'none',
      async () => validCapture,
      async () => {
        throw new Error('close unavailable');
      }
    );

    const report = await proof.run();

    expect(report).toMatchObject({
      outcome: 'failed',
      browserCloseOutcome: 'error',
      r2Operations: 1,
      error: 'Browser close failed: close unavailable',
    });
    expect(proof.uploads).toHaveLength(1);
    expect(proof.checkpoints.at(-1)?.outcome).toBe('failed');
  });

  test('fails the proof and retains both latencies when acknowledgment validation fails', async () => {
    const proof = harness(
      'none',
      async () => validCapture,
      async () => undefined,
      async (checkpoint) => {
        if (checkpoint.phase === 'before_capture') {
          throw new Error('Convex checkpoint acknowledgment phase does not match the request');
        }
      }
    );

    const report = await proof.run();

    expect(report).toMatchObject({
      outcome: 'failed',
      r2Operations: 0,
      convexCalls: 2,
      convexBeforeCheckpointLatencyMs: 5,
      convexAfterCheckpointLatencyMs: 5,
      error: 'Convex checkpoint acknowledgment phase does not match the request',
    });
    expect(proof.uploads).toEqual([]);
    expect(proof.checkpoints.map((entry) => entry.phase)).toEqual([
      'before_capture',
      'after_capture',
    ]);
  });
});
