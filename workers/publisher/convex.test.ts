import { describe, expect, test } from 'vitest';

import { createRenderCapability } from '../../convex/lib/assetPublisherHttp';
import { ConvexPublisherClient, type ExactClaim, parseClaim } from './convex';
import { MAX_RENDER_CAPABILITY_BYTES } from './render-capability';

const batchToken = 'b'.repeat(32);
const claimToken = 'c'.repeat(32);

type ClaimOverrides = {
  batchToken?: string;
  claimToken?: string;
  renderCapability?: string;
  replay?: boolean;
  workLane?: unknown;
};

async function claimedResponse(overrides: ClaimOverrides = {}) {
  const responseBatchToken = overrides.batchToken ?? batchToken;
  const responseClaimToken = overrides.claimToken ?? claimToken;
  const renderCapability =
    overrides.renderCapability ??
    (await createRenderCapability(
      {
        version: 1,
        factionId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
        assetType: 'faction_sheet',
        payloadHash: 'a'.repeat(64),
        generation: 1,
        rendererVersion: 'faction-sheet-v1',
        batchToken: responseBatchToken,
        claimToken: responseClaimToken,
        expiresAt: 2_000_000_000_000,
      },
      'render-secret'
    ));
  return {
    ok: true,
    status: 'claimed',
    replay: overrides.replay ?? false,
    targetId: 'k17d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
    factionId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
    assetType: 'faction_sheet',
    batchToken: responseBatchToken,
    claimToken: responseClaimToken,
    generation: 1,
    rendererVersion: 'faction-sheet-v1',
    leaseExpiresAt: 2_000_000_000_000,
    payloadHash: 'a'.repeat(64),
    renderCapability,
    renderCapabilityExpiresAt: 2_000_000_000_000,
    ...(overrides.workLane !== undefined ? { workLane: overrides.workLane } : {}),
  };
}

describe('Convex claimed target parsing', () => {
  test.each([
    false,
    true,
  ])('accepts a production-shape signed render capability when replay is %s', async (replay) => {
    const response = await claimedResponse({ replay });
    expect(response.renderCapability.length).toBeGreaterThan(256);
    expect(response.renderCapability.length).toBeLessThanOrEqual(MAX_RENDER_CAPABILITY_BYTES);
    expect(parseClaim(response)).toEqual({
      status: 'claimed',
      replay,
      targetId: response.targetId,
      factionId: response.factionId,
      assetType: 'faction_sheet',
      batchToken,
      claimToken,
      generation: 1,
      rendererVersion: 'faction-sheet-v1',
      leaseExpiresAt: response.leaseExpiresAt,
      payloadHash: response.payloadHash,
      renderCapability: response.renderCapability,
      renderCapabilityExpiresAt: response.renderCapabilityExpiresAt,
    });
  });

  test('retains the generic 16 through 256 character batch and claim token bounds', async () => {
    expect(parseClaim(await claimedResponse({ batchToken: 'b'.repeat(16) })).status).toBe(
      'claimed'
    );
    expect(parseClaim(await claimedResponse({ claimToken: 'c'.repeat(16) })).status).toBe(
      'claimed'
    );
    expect(parseClaim(await claimedResponse({ batchToken: 'b'.repeat(256) })).status).toBe(
      'claimed'
    );
    expect(parseClaim(await claimedResponse({ claimToken: 'c'.repeat(256) })).status).toBe(
      'claimed'
    );
    const response = await claimedResponse();
    expect(() => parseClaim({ ...response, batchToken: 'b'.repeat(15) })).toThrow(
      'Convex claimed target response is invalid'
    );
    expect(() => parseClaim({ ...response, claimToken: 'c'.repeat(15) })).toThrow(
      'Convex claimed target response is invalid'
    );
    expect(() => parseClaim({ ...response, batchToken: 'b'.repeat(257) })).toThrow(
      'Convex claimed target response is invalid'
    );
    expect(() => parseClaim({ ...response, claimToken: 'c'.repeat(257) })).toThrow(
      'Convex claimed target response is invalid'
    );
  });

  test('accepts only the bounded foreground/rollout lane projection', async () => {
    const rollout = await claimedResponse({ workLane: 'rollout' });
    expect(parseClaim(rollout)).toMatchObject({ status: 'claimed', workLane: 'rollout' });
    const foreground = await claimedResponse({ workLane: 'foreground' });
    expect(parseClaim(foreground)).toMatchObject({ status: 'claimed', workLane: 'foreground' });
    expect(() => parseClaim({ ...rollout, workLane: 'operator-selected-lane' })).toThrow(
      'Convex claimed target response is invalid'
    );
  });

  test('rejects malformed, truncated, oversized, and extra-segment capabilities', async () => {
    const response = await claimedResponse();
    const valid = response.renderCapability;
    const [payload, signature] = valid.split('.');
    const malformed = `${payload}.${signature.slice(0, -1)}*`;
    const truncated = valid.slice(0, -1);
    const oversized = `${'a'.repeat(MAX_RENDER_CAPABILITY_BYTES - 43)}.${'s'.repeat(43)}`;
    const extraSegment = `${valid}.extra`;

    for (const renderCapability of [malformed, truncated, oversized, extraSegment]) {
      expect(() => parseClaim({ ...response, renderCapability })).toThrow(
        'Convex claimed target response is invalid'
      );
    }
  });
});

describe('retained foreground checkpoint requests', () => {
  test('sends the additive retainBatch flag only for retained complete/fail/release calls', async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      requests.push({ path, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      const status = path.endsWith('/complete')
        ? 'completed'
        : path.endsWith('/fail')
          ? 'failed'
          : 'released';
      return Response.json({ ok: true, status });
    };
    const client = new ConvexPublisherClient({
      pollUrl: 'https://convex.example.com/poll',
      executorBaseUrl: 'https://convex.example.com/executor',
      pollToken: 'poll-token',
      executorToken: 'executor-token',
      fetcher,
    });
    const exact: ExactClaim = {
      targetId: 'target-one',
      batchToken,
      claimToken,
      generation: 1,
      rendererVersion: 'faction-sheet-v1',
    };

    await client.complete(exact, 'etag-one', 1_234, undefined, true);
    await client.fail(exact, 'bounded failure', undefined, true);
    await client.release(exact, undefined, true);
    await client.release(exact);

    expect(requests.slice(0, 3).map(({ body }) => body.retainBatch)).toEqual([true, true, true]);
    expect(requests[3]?.body).not.toHaveProperty('retainBatch');
  });
});
