import { describe, expect, test, vi } from 'vitest';

import { ConvexPublisherClient, parseTakeWork } from './convex';

function assignedItem(index = 1) {
  return {
    targetId: `target-${index}`,
    factionId: `faction-${index}`,
    assetType: 'faction_sheet',
    claimToken: `claim-token-${String(index).padStart(20, '0')}`,
    generation: 1,
    rendererVersion: 'faction-sheet-v3',
    leaseExpiresAt: 2_000_000_000_000,
    workLane: 'foreground',
  };
}

describe('Convex item-list parsing', () => {
  test('accepts bounded independent item assignments and empty busy responses', () => {
    expect(
      parseTakeWork({
        ok: true,
        schemaVersion: 1,
        status: 'assigned',
        leaseExpiresAt: 2_000_000_000_000,
        items: [assignedItem(1), assignedItem(2)],
      })
    ).toMatchObject({
      status: 'assigned',
      items: [{ targetId: 'target-1' }, { targetId: 'target-2' }],
    });
    expect(
      parseTakeWork({
        ok: true,
        schemaVersion: 1,
        status: 'empty',
        reason: 'busy',
        leaseExpiresAt: 2_000_000_000_000,
        items: [],
      })
    ).toEqual({
      status: 'empty',
      reason: 'busy',
      leaseExpiresAt: 2_000_000_000_000,
      items: [],
    });
  });

  test('rejects oversized, duplicate, and mismatched-lease assignments', () => {
    const response = (items: unknown[]) => ({
      ok: true,
      schemaVersion: 1,
      status: 'assigned',
      leaseExpiresAt: 2_000_000_000_000,
      items,
    });
    expect(() =>
      parseTakeWork(response(Array.from({ length: 21 }, (_, i) => assignedItem(i))))
    ).toThrow();
    expect(() => parseTakeWork(response([assignedItem(1), assignedItem(1)]))).toThrow();
    expect(() =>
      parseTakeWork(response([{ ...assignedItem(1), leaseExpiresAt: 2_000_000_000_001 }]))
    ).toThrow();
  });
});

describe('Convex item client', () => {
  test('uses only the settled item endpoints and exact request bodies', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ url, body });
      if (url.endsWith('/take-work')) {
        return Response.json({
          ok: true,
          schemaVersion: 1,
          status: 'assigned',
          leaseExpiresAt: 2_000_000_000_000,
          items: [assignedItem()],
        });
      }
      if (url.endsWith('/revalidate-item')) {
        return Response.json({
          ok: true,
          status: 'valid',
          leaseExpiresAt: 2_000_000_000_000,
          factionId: 'faction-1',
          assetType: 'faction_sheet',
        });
      }
      if (url.endsWith('/complete-item')) {
        return Response.json({
          ok: true,
          status: 'completed',
          replay: false,
          cacheToken: `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`,
          publishedAt: 1,
        });
      }
      return Response.json({ ok: true, status: 'failed', consecutiveFailures: 1 });
    });
    const client = new ConvexPublisherClient({
      executorBaseUrl: 'https://convex.example.com/asset-publishing/executor',
      executorToken: 'executor-secret',
      fetcher: fetcher as typeof fetch,
    });
    const work = await client.takeWork();
    if (work.status !== 'assigned') throw new Error('Expected work');
    const claim = work.items[0];
    await client.revalidate(claim);
    const cacheToken = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;
    await client.complete(claim, { r2Etag: 'etag', bytes: 123, cacheToken });
    await client.fail(claim, 'target', 'invalid output');

    expect(requests.map((request) => request.url.split('/').at(-1))).toEqual([
      'take-work',
      'revalidate-item',
      'complete-item',
      'fail-item',
    ]);
    expect(requests[0]?.body).toEqual({ schemaVersion: 1 });
    expect(requests[2]?.body).toMatchObject({ r2Etag: 'etag', bytes: 123, cacheToken });
    expect(requests[3]?.body).toMatchObject({ attribution: 'target', error: 'invalid output' });
  });

  test('rejects completion acknowledgment for a different cache token', async () => {
    const client = new ConvexPublisherClient({
      executorBaseUrl: 'https://convex.example.com/asset-publishing/executor',
      executorToken: 'executor-secret',
      fetcher: (async () =>
        Response.json({
          ok: true,
          status: 'completed',
          replay: false,
          cacheToken: `v1.${'c'.repeat(22)}.${'d'.repeat(43)}`,
          publishedAt: 1,
        })) as typeof fetch,
    });
    await expect(
      client.complete(assignedItem(), {
        r2Etag: 'etag',
        bytes: 123,
        cacheToken: `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`,
      })
    ).rejects.toThrow(/different cache token/);
  });
});
