/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const revision = '10000000-1000-4000-8000-100000000001';
const geometry = { width: 900, height: 1263, parts: [{ key: 'body', x: 0.1, y: 0.4, width: 0.8, height: 0.5 }] };

async function fixture() {
  const t = convexTest(schema, modules);
  const assetId = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Component author' });
    return ctx.db.insert('assets', {
      owner_id: ownerId,
      type: 'card-treachery',
      data: publishingTreacheryCard,
      slug: 'lasgun',
      created_at: '2026-09-10',
      updated_at: '2026-09-10',
      is_deleted: false,
      group_id: null,
    });
  });
  const jobId = await t.run((ctx) =>
    ctx.db.insert('publication_jobs', {
      asset_type: 'card-treachery',
      asset_id: assetId,
      asset_data: { assetId, slug: 'lasgun', card: publishingTreacheryCard },
      status: 'in_progress',
      attempt_counter: 1,
      expires_at: Date.now() + 100_000,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
  );
  const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId });
  return { t, assetId, jobId, payloadHash: snapshot!.payloadHash };
}

describe('Card and token component publication', () => {
  test('publishes measured metadata only with the matching captured payload', async () => {
    const { t, assetId, jobId, payloadHash } = await fixture();
    expect(
      await t.mutation(internal.publicationJobs.completeJob, {
        jobId,
        cacheToken: revision,
        payloadHash: 'b'.repeat(64),
        componentGeometry: geometry,
      })
    ).toEqual({ status: 'missing' });
    expect(
      await t.query(internal.componentPublication.resolveDelivery, { assetId, assetType: 'card-treachery' })
    ).toMatchObject({ status: 'pending' });
    await t.mutation(internal.publicationJobs.completeJob, {
      jobId,
      cacheToken: revision,
      payloadHash,
      componentGeometry: geometry,
    });
    expect(
      await t.query(internal.componentPublication.resolveDelivery, { assetId, assetType: 'card-treachery' })
    ).toMatchObject({ status: 'found', revision });
    const publication = await t.run((ctx) => ctx.db.query('publication_assets').unique());
    expect(publication?.component_geometry).toEqual(geometry);
    await t.run((ctx) => ctx.db.patch(assetId, { is_deleted: true }));
    expect(
      await t.query(internal.componentPublication.resolveDelivery, { assetId, assetType: 'card-treachery' })
    ).toMatchObject({ status: 'missing' });
  });

  test('keeps legacy JPEG completions readable without claiming they contain named geometry', async () => {
    const { t, assetId, jobId } = await fixture();
    await t.mutation(internal.publicationJobs.completeJob, { jobId, cacheToken: revision });
    expect(
      await t.query(internal.componentPublication.resolveDelivery, { assetId, assetType: 'card-treachery' })
    ).toMatchObject({ status: 'pending' });
  });

  test('stops exposing a removed custom token back even if its envelope remains', async () => {
    const { t, assetId } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(assetId, {
        type: 'token-disc',
        data: {
          name: 'Token',
          about: '',
          front: publishingTokenFace,
          back: { mode: 'custom', face: publishingTokenFace },
        },
      });
      await ctx.db.insert('publication_assets', {
        asset_type: 'token-disc',
        asset_id: `${assetId}.back`,
        cache_token: revision,
        component_geometry: geometry,
        published_at: Date.now(),
      });
    });
    expect(
      await t.query(internal.componentPublication.resolveDelivery, {
        assetId: `${assetId}.back`,
        assetType: 'token-disc',
      })
    ).toMatchObject({ status: 'found' });
    await t.run((ctx) =>
      ctx.db.patch(assetId, { data: { name: 'Token', about: '', front: publishingTokenFace, back: { mode: 'same' } } })
    );
    expect(
      await t.query(internal.componentPublication.resolveDelivery, {
        assetId: `${assetId}.back`,
        assetType: 'token-disc',
      })
    ).toMatchObject({ status: 'missing' });
  });
});
