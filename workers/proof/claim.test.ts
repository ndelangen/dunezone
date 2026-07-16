import { describe, expect, test, vi } from 'vitest';

import { acquireDefaultLimitExperimentClaim, DEFAULT_LIMIT_EXPERIMENT_CLAIM_KEY } from './claim';
import type { ProofReport } from './core';
import { createProofWakeUp } from './dispatch';
import { ProofQueueConsumer, type ProofQueueDelivery } from './queue';

const wakeUp = createProofWakeUp(
  Date.parse('2026-07-16T12:00:00.000Z'),
  '10a5318c-e0f2-49c6-bd19-5221a80643f7'
);

function delivery(id: string): ProofQueueDelivery & {
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
} {
  return { id, attempts: 1, body: wakeUp, ack: vi.fn(), retry: vi.fn() };
}

describe('default-limit experiment R2 one-shot claim', () => {
  test('allows one fresh consumer instance and acks the other as a duplicate', async () => {
    let markerExists = false;
    const put = vi.fn(async () => {
      if (markerExists) return null;
      markerExists = true;
      return { key: DEFAULT_LIMIT_EXPERIMENT_CLAIM_KEY };
    });
    const bucket = { put } as unknown as R2Bucket;
    const acquireClaim = async (candidate: typeof wakeUp, message: ProofQueueDelivery) =>
      await acquireDefaultLimitExperimentClaim(bucket, candidate, message);
    const firstMessage = delivery('first-delivery');
    const secondMessage = delivery('second-delivery');
    const runProof = vi.fn(async () => ({ outcome: 'success' }) as ProofReport);
    const log = vi.fn();

    const dispositions = await Promise.all([
      new ProofQueueConsumer(log).consume(firstMessage, acquireClaim, runProof),
      new ProofQueueConsumer(log).consume(secondMessage, acquireClaim, runProof),
    ]);

    expect(dispositions).toContainEqual({ action: 'ack', reason: 'completed' });
    expect(dispositions).toContainEqual({ action: 'ack', reason: 'duplicate' });
    expect(runProof).toHaveBeenCalledOnce();
    expect(firstMessage.ack).toHaveBeenCalledOnce();
    expect(secondMessage.ack).toHaveBeenCalledOnce();
    expect(firstMessage.retry).not.toHaveBeenCalled();
    expect(secondMessage.retry).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[0]?.[0]).toBe(DEFAULT_LIMIT_EXPERIMENT_CLAIM_KEY);
    expect(put.mock.calls[0]?.[2]?.onlyIf).toBeInstanceOf(Headers);
    expect(put.mock.calls[0]?.[2]?.onlyIf.get('if-none-match')).toBe('*');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ reason: 'duplicate' }));
  });

  test('acks a claim-store failure as exhausted without starting proof work', async () => {
    const bucket = {
      put: vi.fn(async () => {
        throw new Error('R2 claim unavailable');
      }),
    } as unknown as R2Bucket;
    const acquireClaim = async (candidate: typeof wakeUp, message: ProofQueueDelivery) =>
      await acquireDefaultLimitExperimentClaim(bucket, candidate, message);
    const message = delivery('failed-claim');
    const runProof = vi.fn(async () => ({ outcome: 'success' }) as ProofReport);
    const log = vi.fn();

    await expect(
      new ProofQueueConsumer(log).consume(message, acquireClaim, runProof)
    ).resolves.toEqual({ action: 'ack', reason: 'exhausted' });

    expect(runProof).not.toHaveBeenCalled();
    expect(bucket.put).toHaveBeenCalledOnce();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ack',
        error: 'R2 claim unavailable',
        reason: 'exhausted',
      })
    );
  });
});
