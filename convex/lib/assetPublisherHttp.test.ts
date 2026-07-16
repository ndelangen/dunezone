// @vitest-environment edge-runtime

import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import {
  createCacheToken,
  createRenderCapability,
  handleAuthenticatedJson,
  MAX_PUBLISHER_JSON_BODY_BYTES,
  verifyCacheToken,
  verifyRenderCapability,
} from './assetPublisherHttp';

function request(secret: string, body: unknown = { schemaVersion: 1 }) {
  return new Request('https://example.convex.site/asset-publishing/executor/acquire', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('publisher HTTP capabilities', () => {
  test('absent or poll-only credentials cannot reach executor operations', async () => {
    const execute = vi.fn(async () => ({ mutated: true }));
    for (const expectedSecret of [undefined, 'executor-secret']) {
      const response = await handleAuthenticatedJson(request('poll-secret'), {
        expectedSecret,
        schema: z.strictObject({ schemaVersion: z.literal(1) }),
        execute,
      });
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(execute).not.toHaveBeenCalled();
  });

  test('accepts an exact-limit JSON body with or without a declared length', async () => {
    const body = JSON.stringify('x'.repeat(MAX_PUBLISHER_JSON_BODY_BYTES - 2));
    expect(new TextEncoder().encode(body)).toHaveLength(MAX_PUBLISHER_JSON_BODY_BYTES);
    for (const headers of [
      new Headers({
        Authorization: 'Bearer executor-secret',
        'Content-Length': String(body.length),
      }),
      new Headers({ Authorization: 'Bearer executor-secret' }),
    ]) {
      const execute = vi.fn(async (value: string) => ({ length: value.length }));
      const response = await handleAuthenticatedJson(
        new Request('https://example.convex.site/asset-publishing/executor/acquire', {
          method: 'POST',
          headers,
          body,
        }),
        { expectedSecret: 'executor-secret', schema: z.string(), execute }
      );
      expect(response.status).toBe(200);
      expect(execute).toHaveBeenCalledOnce();
    }
  });

  test.each([
    ['declared oversize', String(MAX_PUBLISHER_JSON_BODY_BYTES + 1)],
    ['absent declared length', undefined],
    ['lying declared length', '1'],
  ] as const)('rejects an actual oversized body: %s', async (_label, contentLength) => {
    const body = JSON.stringify('x'.repeat(MAX_PUBLISHER_JSON_BODY_BYTES - 1));
    expect(new TextEncoder().encode(body).length).toBe(MAX_PUBLISHER_JSON_BODY_BYTES + 1);
    const headers = new Headers({ Authorization: 'Bearer executor-secret' });
    if (contentLength !== undefined) headers.set('Content-Length', contentLength);
    const execute = vi.fn(async () => ({ mutated: true }));
    const response = await handleAuthenticatedJson(
      new Request('https://example.convex.site/asset-publishing/executor/acquire', {
        method: 'POST',
        headers,
        body,
      }),
      { expectedSecret: 'executor-secret', schema: z.unknown(), execute }
    );
    expect(response.status).toBe(413);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(execute).not.toHaveBeenCalled();
  });

  test('rejects malformed JSON within the byte bound', async () => {
    const execute = vi.fn(async () => ({ mutated: true }));
    const response = await handleAuthenticatedJson(
      new Request('https://example.convex.site/asset-publishing/executor/acquire', {
        method: 'POST',
        headers: { Authorization: 'Bearer executor-secret' },
        body: '{not-json',
      }),
      {
        expectedSecret: 'executor-secret',
        schema: z.unknown(),
        execute,
      }
    );
    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  test('render capabilities are short-lived and bound to the complete claim snapshot', async () => {
    const payload = {
      version: 1 as const,
      factionId: 'faction-id',
      assetType: 'faction_sheet' as const,
      payloadHash: 'a'.repeat(64),
      generation: 7,
      rendererVersion: 'faction-sheet-v1',
      batchToken: 'batch-token-0000000000000001',
      claimToken: 'claim-token-0000000000000001',
      expiresAt: 2_000,
    };
    const capability = await createRenderCapability(payload, 'render-secret');
    await expect(verifyRenderCapability(capability, 'render-secret', 1_999)).resolves.toEqual(
      payload
    );
    await expect(verifyRenderCapability(capability, 'render-secret', 2_000)).resolves.toBeNull();
    await expect(verifyRenderCapability(capability, 'wrong-secret', 1_999)).resolves.toBeNull();

    const [encoded, signature] = capability.split('.');
    const tamperedPayload = `${encoded?.startsWith('A') ? 'B' : 'A'}${encoded?.slice(1)}`;
    const tampered = `${tamperedPayload}.${signature}`;
    await expect(verifyRenderCapability(tampered, 'render-secret', 1_999)).resolves.toBeNull();
  });

  test('cache tokens carry at least 128 random bits and verify only for their faction/type', async () => {
    const token = await createCacheToken('faction-id', 'faction_sheet', 'cache-secret');
    const [, nonce] = token.split('.');
    expect(nonce?.length).toBeGreaterThanOrEqual(22);
    await expect(
      verifyCacheToken(token, 'faction-id', 'faction_sheet', 'cache-secret')
    ).resolves.toBe(true);
    await expect(
      verifyCacheToken(token, 'other-faction', 'faction_sheet', 'cache-secret')
    ).resolves.toBe(false);
    await expect(verifyCacheToken(token, 'faction-id', 'faction_sheet', undefined)).resolves.toBe(
      false
    );
  });
});
