import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ProofWakeUp } from './dispatch';
import { type Env, proofWorker } from './index';

function environment() {
  const send = vi.fn(async () => ({
    metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
  }));
  const assetsFetch = vi.fn(async () => new Response('asset'));
  const env = {
    ASSETS: { fetch: assetsFetch },
    PROOF_QUEUE: { send },
    PROOF_TRIGGER_TOKEN: 'trigger-secret',
    PROOF_CAPTURE_TOKEN: 'capture-secret',
    CONVEX_PROOF_ELIGIBILITY_URL: 'https://proof.convex.site/eligibility',
    CONVEX_PROOF_TOKEN: 'convex-secret',
  } as unknown as Env;
  return { env, send, assetsFetch };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('proof Worker producer boundaries', () => {
  test('manual trigger enqueues one minimal wake-up and returns without capture', async () => {
    const { env, send } = environment();
    const response = await proofWorker.fetch(
      new Request('https://proof.workers.dev/__proof/enqueue', {
        method: 'POST',
        headers: { Authorization: 'Bearer trigger-secret' },
      }),
      env,
      {} as ExecutionContext
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledOnce();
    const [message, options] = send.mock.calls[0] as unknown as [
      ProofWakeUp,
      { contentType: string },
    ];
    expect(Object.keys(message).sort()).toEqual(['scheduledCutoff', 'schemaVersion', 'triggerId']);
    expect(options).toEqual({ contentType: 'json' });
  });

  test('rejects an unauthenticated manual trigger before Queue access', async () => {
    const { env, send } = environment();
    const response = await proofWorker.fetch(
      new Request('https://proof.workers.dev/__proof/enqueue', { method: 'POST' }),
      env,
      {} as ExecutionContext
    );

    expect(response.status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  test('rejects an asset-bearing manual message before Queue access', async () => {
    const { env, send } = environment();
    const response = await proofWorker.fetch(
      new Request('https://proof.workers.dev/__proof/enqueue', {
        method: 'POST',
        headers: { Authorization: 'Bearer trigger-secret' },
        body: JSON.stringify({
          schemaVersion: 1,
          scheduledCutoff: '2026-07-16T12:00:00.000Z',
          triggerId: '10a5318c-e0f2-49c6-bd19-5221a80643f7',
          factionId: 'forbidden',
        }),
      }),
      env,
      {} as ExecutionContext
    );

    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  test.each([
    ['empty', 0],
    ['eligible', 1],
  ] as const)('Cron %s mode sends the expected number of Queue messages', async (eligibility, sends) => {
    const { env, send } = environment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const wakeUp = JSON.parse(String(init?.body)) as ProofWakeUp;
        return Response.json({ ok: true, eligibility, ...wakeUp });
      })
    );

    await proofWorker.scheduled(
      { scheduledTime: Date.parse('2026-07-16T12:00:00.000Z') } as ScheduledController,
      env,
      {} as ExecutionContext
    );

    expect(send).toHaveBeenCalledTimes(sends);
  });

  test('Cron poll failure returns without Queue or browser work', async () => {
    const { env, send } = environment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 }))
    );

    await expect(
      proofWorker.scheduled(
        { scheduledTime: Date.parse('2026-07-16T12:00:00.000Z') } as ScheduledController,
        env,
        {} as ExecutionContext
      )
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('proof Worker Queue delivery boundary', () => {
  test('acknowledges an unexpected extra message without requesting a Queue retry', async () => {
    const { env } = environment();
    const first = {
      id: 'invalid-first',
      attempts: 1,
      body: { invalid: true },
      ack: vi.fn(),
      retry: vi.fn(),
      timestamp: new Date(),
    };
    const extra = {
      id: 'unexpected-extra',
      attempts: 1,
      body: { invalid: true },
      ack: vi.fn(),
      retry: vi.fn(),
      timestamp: new Date(),
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await proofWorker.queue(
      {
        queue: 'faction-sheet-one-pdf-proof',
        messages: [first, extra],
        ackAll: vi.fn(),
        retryAll: vi.fn(),
      },
      env,
      {} as ExecutionContext
    );

    expect(first.ack).toHaveBeenCalledOnce();
    expect(first.retry).not.toHaveBeenCalled();
    expect(extra.ack).toHaveBeenCalledOnce();
    expect(extra.retry).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('"reason":"exhausted"'));
  });
});
