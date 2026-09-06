/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { projectPublicAssetPublishingStatus } from './assetPublishingStatus';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const assetId = 'k1'.repeat(12);
const legacyToken = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;
const executorSecret = 'executor-secret';
const activationSecret = 'activation-secret';

beforeEach(() => {
  vi.stubEnv('ASSET_PUBLISHER_EXECUTOR_SECRET', executorSecret);
  vi.stubEnv('ASSET_PUBLISHER_ACTIVATION_SECRET', activationSecret);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function publicationFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    publicationId: await ctx.db.insert('publication_assets', {
      asset_type: 'faction_sheet',
      asset_id: assetId,
      cache_token: legacyToken,
      published_at: 1,
    }),
    jobId: await ctx.db.insert('publication_jobs', {
      asset_type: 'faction_sheet',
      asset_id: assetId,
      asset_data: {},
      status: 'in_progress',
      attempt_counter: 0,
      expires_at: Date.now() + 60_000,
      created_at: Date.now(),
      updated_at: Date.now(),
    }),
  }));
  return { t, ...ids };
}

function post(body: unknown, secret?: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret === undefined ? {} : { Authorization: `Bearer ${secret}` }),
    },
    body: JSON.stringify(body),
  };
}

describe('Publication completion HTTP compatibility', () => {
  test.each(['123', legacyToken])(
    'stores an opaque cache buster without changing the public path: %s',
    async (cacheToken) => {
      const { t, jobId, publicationId } = await publicationFixture();
      const previous = await t.run(async (ctx) => await ctx.db.get(publicationId));
      expect(projectPublicAssetPublishingStatus('faction_sheet', previous).publicationHref).toBe(
        `/published/factions/${assetId}/sheet.pdf?v=${legacyToken}`
      );

      const response = await t.fetch(
        '/asset-publishing/executor/complete-job',
        post({ schemaVersion: 1, jobId, cacheToken }, executorSecret)
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ ok: true, status: 'completed' });

      const publication = await t.run(async (ctx) => await ctx.db.get(publicationId));
      expect(publication).toMatchObject({ asset_id: assetId, cache_token: cacheToken });
      expect(projectPublicAssetPublishingStatus('faction_sheet', publication).publicationHref).toBe(
        `/published/factions/${assetId}/sheet.pdf?v=${cacheToken}`
      );
      expect(await t.run(async (ctx) => await ctx.db.get(jobId))).toBeNull();
    }
  );

  test.each(['', 'x'.repeat(257)])(
    'rejects unusable completion metadata while retaining the publication: %s',
    async (cacheToken) => {
      const { t, jobId, publicationId } = await publicationFixture();
      const response = await t.fetch(
        '/asset-publishing/executor/complete-job',
        post({ schemaVersion: 1, jobId, cacheToken }, executorSecret)
      );
      expect(response.status).toBe(400);
      expect(await t.run(async (ctx) => await ctx.db.get(publicationId))).toMatchObject({ cache_token: legacyToken });
      expect(await t.run(async (ctx) => await ctx.db.get(jobId))).toMatchObject({ status: 'in_progress' });
    }
  );

  test('completion still requires the executor credential and leaves rejected work untouched', async () => {
    const { t, jobId, publicationId } = await publicationFixture();
    for (const secret of [undefined, activationSecret, 'wrong-secret']) {
      const response = await t.fetch(
        '/asset-publishing/executor/complete-job',
        post({ schemaVersion: 1, jobId, cacheToken: '123' }, secret)
      );
      expect(response.status).toBe(404);
    }
    expect(await t.run(async (ctx) => await ctx.db.get(publicationId))).toMatchObject({ cache_token: legacyToken });
    expect(await t.run(async (ctx) => await ctx.db.get(jobId))).toMatchObject({ status: 'in_progress' });
  });

  test('activation and executor credentials remain separate', async () => {
    const t = convexTest(schema, modules);
    const revisions = { schemaVersion: 1, operation: 'read' };
    expect((await t.fetch('/asset-publishing/revisions', post(revisions, executorSecret))).status).toBe(404);
    expect((await t.fetch('/asset-publishing/revisions', post(revisions, activationSecret))).status).toBe(200);

    vi.stubEnv('ASSET_PUBLISHER_ACTIVATION_SECRET', executorSecret);
    expect((await t.fetch('/asset-publishing/revisions', post(revisions, executorSecret))).status).toBe(404);
    expect(
      (await t.fetch('/asset-publishing/executor/take-work', post({ schemaVersion: 1 }, executorSecret))).status
    ).toBe(404);
  });
});
