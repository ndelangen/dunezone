/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { DUKE_PRAD_VIDAL_TOKEN } from '../src/shared/assets/leaderToken';
import { parseRawAsset } from '../src/shared/authoring/raw';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';

async function setup(active = true) {
  const t = applicationTest();
  const ownerId = await t.run(async (ctx) => {
    await ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: true,
      renderer_revisions: active ? { 'token-leader': 1 } : {},
      updated_at: 1,
    });
    return await ctx.db.insert('users', { name: 'Creator' });
  });
  return { t, owner: t.withIdentity({ subject: ownerId }) };
}

test('standalone leaders save, join bundles and publish one face without faction or Traitor records', async () => {
  const { t, owner } = await setup();
  await expect(t.mutation(api.assets.create, { type: 'token-leader', data: DUKE_PRAD_VIDAL_TOKEN })).rejects.toThrow();
  const created = await owner.mutation(api.assets.create, { type: 'token-leader', data: DUKE_PRAD_VIDAL_TOKEN });
  expect((await t.query(api.assets.page, { type: 'token-leader', slug: created.slug }))?.asset.data).toEqual(
    DUKE_PRAD_VIDAL_TOKEN
  );
  const rows = await t.run(async (ctx) => ({
    assets: await ctx.db.query('assets').collect(),
    factions: await ctx.db.query('factions').collect(),
    jobs: await ctx.db.query('publication_jobs').collect(),
  }));
  expect(rows.assets).toHaveLength(1);
  expect(rows.factions).toHaveLength(0);
  expect(rows.jobs).toHaveLength(1);
  const { about: _about, ...leader } = DUKE_PRAD_VIDAL_TOKEN;
  expect(rows.jobs[0]).toMatchObject({
    asset_type: 'token-leader',
    asset_id: created.id,
    asset_data: { assetId: created.id, slug: created.slug, leader },
  });
  await t.run((ctx) => ctx.db.patch(rows.jobs[0]._id, { status: 'in_progress', expires_at: Date.now() + 100_000 }));
  const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId: rows.jobs[0]._id });
  expect(snapshot).toMatchObject({ assetType: 'token-leader', payload: { leader } });
  const geometry = { width: 600, height: 600, parts: [{ key: 'portrait', x: 0.1, y: 0.1, width: 0.8, height: 0.8 }] };
  await t.mutation(internal.publicationJobs.completeJob, {
    jobId: rows.jobs[0]._id,
    cacheToken: '10000000-1000-4000-8000-100000000001',
    payloadHash: snapshot!.payloadHash,
    componentGeometry: geometry,
  });
  expect(
    await t.query(internal.componentPublication.resolveDelivery, { assetId: created.id, assetType: 'token-leader' })
  ).toMatchObject({ status: 'found' });
  expect(
    await t.query(internal.componentPublication.resolveDelivery, {
      assetId: created.id + '.back',
      assetType: 'token-leader',
    })
  ).toMatchObject({ status: 'missing' });
  const bundle = await owner.mutation(api.assets.create, {
    type: 'bundle',
    data: { name: 'Leaders', about: '', band: { label: 'Leaders', background: DUKE_PRAD_VIDAL_TOKEN.background } },
  });
  await owner.mutation(api.assets.setMemberCount, { container_id: bundle.id, member_id: created.id, count: 2 });
  expect((await t.query(api.assets.page, { type: 'bundle', slug: bundle.slug }))?.members).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ count: 2, member: expect.objectContaining({ id: created.id, type: 'token-leader' }) }),
    ])
  );
  expect((await t.query(api.assets.page, { type: 'token-leader', slug: created.slug }))?.inBundles).toHaveLength(1);
  const strangerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
  await expect(
    t.withIdentity({ subject: strangerId }).mutation(api.assets.update, { id: created.id, data: DUKE_PRAD_VIDAL_TOKEN })
  ).rejects.toThrow();
  const edited = { ...DUKE_PRAD_VIDAL_TOKEN, strength: 'X', about: 'An independent leader.' };
  const loaded = parseRawAsset('token-leader', edited);
  await owner.mutation(api.assets.update, { id: created.id, data: loaded.data });
  expect((await t.query(api.assets.page, { type: 'token-leader', slug: created.slug }))?.asset.data).toEqual(edited);
  for (const patch of [
    { memberId: 'VIDL' },
    { back: { mode: 'same' } },
    { factionId: 'ecaz' },
    { strength: 'too long' },
    { image: 'https://example.com/portrait.png' },
  ]) {
    await expect(
      owner.mutation(api.assets.update, { id: created.id, data: { ...edited, ...patch } })
    ).rejects.toThrow();
  }
  expect((await t.query(api.assets.page, { type: 'token-leader', slug: created.slug }))?.asset.data).toEqual(edited);
});

test('the new renderer waits for activation without inventing a fallback or back', async () => {
  const { t, owner } = await setup(false);
  const created = await owner.mutation(api.assets.create, { type: 'token-leader', data: DUKE_PRAD_VIDAL_TOKEN });
  expect(await t.run((ctx) => ctx.db.query('publication_jobs').collect())).toHaveLength(0);
  await t.run(async (ctx) => {
    const settings = await ctx.db
      .query('admin_settings')
      .withIndex('by_key', (q) => q.eq('key', 'publication'))
      .unique();
    await ctx.db.patch(settings!._id, { renderer_revisions: { 'token-leader': 1 } });
  });
  await owner.mutation(api.assets.update, { id: created.id, data: DUKE_PRAD_VIDAL_TOKEN });
  const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
  expect(jobs).toHaveLength(1);
  expect(jobs[0].asset_id).toBe(created.id);
});
