// @vitest-environment edge-runtime

import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import {
  createCacheSigningSecret,
  createCacheToken,
  handleAuthenticatedJson,
  MAX_PUBLISHER_JSON_BODY_BYTES,
  verifyCacheToken,
} from './assetPublisherHttp';

function request(secret: string, body: unknown = { schemaVersion: 1 }) {
  return new Request('https://example.convex.site/asset-publishing/executor/acquire', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('publisher HTTP capabilities', () => {
  test('absent or incorrect credentials cannot reach executor operations', async () => {
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

  test('cache tokens carry at least 128 random bits and verify only for their faction/type', async () => {
    const cacheSigningSecret = createCacheSigningSecret();
    const tokens = await Promise.all(
      Array.from(
        { length: 32 },
        async () => await createCacheToken('faction-id', 'faction_sheet', cacheSigningSecret)
      )
    );
    expect(new Set(tokens).size).toBe(tokens.length);
    const token = tokens[0];
    if (!token) throw new Error('missing generated cache token');
    const [, nonce] = token.split('.');
    expect(nonce).toHaveLength(22);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    await expect(
      verifyCacheToken(token, 'faction-id', 'faction_sheet', cacheSigningSecret)
    ).resolves.toBe(true);
    await expect(
      verifyCacheToken(token, 'other-faction', 'faction_sheet', cacheSigningSecret)
    ).resolves.toBe(false);
    await expect(verifyCacheToken(token, 'faction-id', 'faction_sheet', undefined)).resolves.toBe(
      false
    );
    await expect(
      verifyCacheToken(`${token}a`, 'faction-id', 'faction_sheet', cacheSigningSecret)
    ).resolves.toBe(false);
    await expect(
      verifyCacheToken(
        `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`,
        'faction-id',
        'faction_sheet',
        cacheSigningSecret
      )
    ).resolves.toBe(false);
  });

  test('cache signing secrets are exact canonical 256-bit values and fail closed otherwise', async () => {
    const secret = createCacheSigningSecret();
    expect(secret).toMatch(/^s1\.[A-Za-z0-9_-]{43}$/);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const encoded = secret.slice(3);
    const finalIndex = alphabet.indexOf(encoded.at(-1) ?? '');
    const noncanonicalAlias = `${secret.slice(0, -1)}${alphabet[finalIndex ^ 1]}`;
    const malformed = [
      undefined,
      '',
      's1.short',
      `s1.${'a'.repeat(22)}`,
      `s1.${'a'.repeat(42)}`,
      `s1.${'a'.repeat(44)}`,
      noncanonicalAlias,
    ];
    for (const candidate of malformed) {
      await expect(
        verifyCacheToken('not-a-token', 'faction-id', 'faction_sheet', candidate)
      ).resolves.toBe(false);
      if (candidate !== undefined) {
        await expect(createCacheToken('faction-id', 'faction_sheet', candidate)).rejects.toThrow(
          /signing secret/
        );
      }
    }

    const token = await createCacheToken('faction-id', 'faction_sheet', secret);
    await expect(
      verifyCacheToken(token, 'faction-id', 'faction_sheet', createCacheSigningSecret())
    ).resolves.toBe(false);
  });
});
