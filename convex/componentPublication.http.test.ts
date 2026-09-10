/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const path = '/asset-publishing/executor/component/resolve-delivery';
const assetId = 'aaaaaaaaaaaaaaaa.7a70b096-6c26-4a75-b622-cefab9e987fa';

beforeEach(() => {
  vi.stubEnv('ASSET_PUBLISHER_EXECUTOR_SECRET', 'executor-secret');
  vi.stubEnv('ASSET_PUBLISHER_ACTIVATION_SECRET', 'activation-secret');
});
afterEach(() => vi.unstubAllEnvs());

function request(id: string, secret?: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ schemaVersion: 1, assetId: id }),
  };
}

describe('Component delivery HTTP boundary', () => {
  test('requires the executor credential and never exposes its resolution through the activation credential', async () => {
    const t = convexTest(schema, modules);
    for (const secret of [undefined, 'activation-secret', 'wrong-secret']) {
      expect((await t.fetch(path, request(assetId, secret))).status).toBe(404);
    }
    const response = await t.fetch(path, request(assetId, 'executor-secret'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, status: 'missing' });
  });

  test('rejects malformed member addresses before resolving them', async () => {
    const t = convexTest(schema, modules);
    for (const id of ['../factions', 'aaaaaaaaaaaaaaaa.Paul', `${assetId}.back`]) {
      expect((await t.fetch(path, request(id, 'executor-secret'))).status).toBe(400);
    }
  });
});
