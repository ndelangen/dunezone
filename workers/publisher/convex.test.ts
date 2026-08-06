import { describe, expect, test, vi } from 'vitest';

import { parseTakeWorkResponse as parseTakeWork } from '../../src/shared/asset-publishing/publication';
import { ConvexPublisherClient } from './convex';

function assignedJob(index = 1) {
  return {
    jobId: `job-${index}`,
    assetType: 'faction_sheet',
    assetId: `faction-${index}`,
    expiresAt: 2_000_000_000_000,
  };
}

describe('Convex Publication work parsing', () => {
  test('accepts bounded assignments and the two empty reasons', () => {
    expect(
      parseTakeWork({
        ok: true,
        schemaVersion: 1,
        status: 'assigned',
        recovered: 2,
        items: [assignedJob(1), assignedJob(2)],
      })
    ).toEqual({
      status: 'assigned',
      recovered: 2,
      items: [assignedJob(1), assignedJob(2)],
    });
    for (const reason of ['disabled', 'no_pending_work']) {
      expect(
        parseTakeWork({
          ok: true,
          schemaVersion: 1,
          status: 'empty',
          reason,
          recovered: 0,
          items: [],
        })
      ).toEqual({ status: 'empty', reason, recovered: 0, items: [] });
    }
  });

  test('rejects malformed and oversized assignments', () => {
    const response = (items: unknown[]) => ({
      ok: true,
      schemaVersion: 1,
      status: 'assigned',
      recovered: 0,
      items,
    });
    expect(() =>
      parseTakeWork(response(Array.from({ length: 21 }, (_, index) => assignedJob(index))))
    ).toThrow();
    expect(() => parseTakeWork(response([{ ...assignedJob(), assetType: 'unknown' }]))).toThrow();
  });
});

describe('Convex Publication client', () => {
  test('uses only the take, complete, and fail job endpoints', async () => {
    const requests: Array<{ operation: string; body: Record<string, unknown> }> = [];
    const cacheToken = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const operation = String(input).split('/').at(-1) ?? '';
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ operation, body });
      if (operation === 'take-work') {
        return Response.json({
          ok: true,
          schemaVersion: 1,
          status: 'assigned',
          recovered: 1,
          items: [assignedJob()],
        });
      }
      if (operation === 'complete-job') {
        return Response.json({ ok: true, status: 'completed', publishedAt: 1 });
      }
      return Response.json({ ok: true, status: 'pending', attemptCounter: 1 });
    });
    const client = new ConvexPublisherClient({
      executorBaseUrl: 'https://convex.example.com/asset-publishing/executor',
      executorToken: 'executor-secret',
      fetcher: fetcher as typeof fetch,
    });

    const work = await client.takeWork();
    if (work.status !== 'assigned') {
      throw new Error('Expected assigned work');
    }
    await client.complete(work.items[0].jobId, cacheToken);
    await client.fail(work.items[0].jobId, 'invalid output');

    expect(requests).toEqual([
      { operation: 'take-work', body: { schemaVersion: 1 } },
      {
        operation: 'complete-job',
        body: { schemaVersion: 1, jobId: 'job-1', cacheToken },
      },
      {
        operation: 'fail-job',
        body: { schemaVersion: 1, jobId: 'job-1', error: 'invalid output' },
      },
    ]);
  });

  test('rejects unknown completion and failure acknowledgements', async () => {
    const client = new ConvexPublisherClient({
      executorBaseUrl: 'https://convex.example.com/asset-publishing/executor',
      executorToken: 'executor-secret',
      fetcher: (async () => Response.json({ ok: true, status: 'unexpected' })) as typeof fetch,
    });
    await expect(
      client.complete('job-1', `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`)
    ).rejects.toThrow();
    await expect(client.fail('job-1', 'broken')).rejects.toThrow();
  });
});
