import { describe, expect, test, vi } from 'vitest';

import type { ProofReport } from './core';
import { createProofWakeUp } from './dispatch';
import { ProofQueueConsumer, type ProofQueueDelivery } from './queue';

const wakeUp = createProofWakeUp(
  Date.parse('2026-07-16T12:00:00.000Z'),
  '10a5318c-e0f2-49c6-bd19-5221a80643f7'
);

const successReport = { outcome: 'success' } as ProofReport;
const failedReport = { outcome: 'failed' } as ProofReport;
const acquireClaim = async () => true;

function delivery(
  body: unknown = wakeUp,
  attempts = 1
): ProofQueueDelivery & {
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
} {
  return { id: crypto.randomUUID(), attempts, body, ack: vi.fn(), retry: vi.fn() };
}

describe('proof Queue consumer acknowledgment policy', () => {
  test.each([
    ['success', successReport, 'completed'],
    ['ordinary proof failure', failedReport, 'failed'],
  ] as const)('acks a handled %s and does not create a Queue retry storm', async (_label, report, reason) => {
    const message = delivery();
    const consumer = new ProofQueueConsumer(vi.fn());

    await expect(consumer.consume(message, acquireClaim, async () => report)).resolves.toEqual({
      action: 'ack',
      reason,
    });
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  test('acks an invalid asset-bearing message without opening a browser', async () => {
    const run = vi.fn(async () => successReport);
    const message = delivery({ ...wakeUp, faction: { id: 'forbidden' } });
    const consumer = new ProofQueueConsumer(vi.fn());

    await expect(consumer.consume(message, acquireClaim, run)).resolves.toEqual({
      action: 'ack',
      reason: 'invalid',
    });
    expect(run).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  test('acks a handled end-to-end capture timeout without automatic redelivery', async () => {
    const message = delivery();
    const timeoutReport = {
      outcome: 'failed',
      browserCloseOutcome: 'closed',
      error: 'Browser capture exceeded the 45000 ms end-to-end deadline',
    } as ProofReport;
    const consumer = new ProofQueueConsumer(vi.fn());

    await expect(
      consumer.consume(message, acquireClaim, async () => timeoutReport)
    ).resolves.toEqual({
      action: 'ack',
      reason: 'failed',
    });
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  test('acks a repeated trigger id after the first handled delivery', async () => {
    const run = vi.fn(async () => successReport);
    const consumer = new ProofQueueConsumer(vi.fn());
    await consumer.consume(delivery(), acquireClaim, run);
    const duplicate = delivery();

    await expect(consumer.consume(duplicate, acquireClaim, run)).resolves.toEqual({
      action: 'ack',
      reason: 'duplicate',
    });
    expect(run).toHaveBeenCalledOnce();
    expect(duplicate.ack).toHaveBeenCalledOnce();
    expect(duplicate.retry).not.toHaveBeenCalled();
  });

  test('acks a concurrent attempt as busy without opening an overlapping browser', async () => {
    let finishFirst: ((report: ProofReport) => void) | undefined;
    const run = vi.fn(
      async () =>
        await new Promise<ProofReport>((resolve) => {
          finishFirst = resolve;
        })
    );
    const consumer = new ProofQueueConsumer(vi.fn());
    const firstPromise = consumer.consume(delivery(), acquireClaim, run);
    const concurrent = delivery(createProofWakeUp(Date.now(), crypto.randomUUID()));

    await expect(consumer.consume(concurrent, acquireClaim, run)).resolves.toEqual({
      action: 'ack',
      reason: 'busy',
    });
    expect(run).toHaveBeenCalledOnce();
    expect(concurrent.ack).toHaveBeenCalledOnce();
    expect(concurrent.retry).not.toHaveBeenCalled();
    finishFirst?.(successReport);
    await firstPromise;
  });

  test('acks unexpected orchestration failure as exhausted without requesting redelivery', async () => {
    const run = async () => {
      throw new Error('Worker orchestration failed');
    };
    const log = vi.fn();
    const consumer = new ProofQueueConsumer(log);
    const message = delivery();

    await expect(consumer.consume(message, acquireClaim, run)).resolves.toEqual({
      action: 'ack',
      reason: 'exhausted',
    });
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ack',
        attempts: 1,
        error: 'Worker orchestration failed',
        reason: 'exhausted',
      })
    );
  });
});
