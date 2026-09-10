/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { ensureFactionMemberIds } from '../src/shared/factions/memberIdentity';
import { internal } from './_generated/api';
import { enqueueFactionLeaderPublications } from './lib/publication';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const tokenA = '10000000-1000-4000-8000-100000000001';
const tokenB = '10000000-1000-4000-8000-100000000002';

async function fixture(active = true) {
  const t = convexTest(schema, modules);
  const faction = ensureFactionMemberIds(structuredClone(assetPublishingFaction));
  const factionId = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Component author' });
    await ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: true,
      renderer_revisions: active ? { 'faction-leader': 1 } : {},
      updated_at: Date.now(),
    });
    return ctx.db.insert('factions', {
      data: faction,
      slug: 'component-proof',
      owner_id: ownerId,
      group_id: null,
      is_deleted: false,
      created_at: '2026-09-09T00:00:00Z',
      updated_at: '2026-09-09T00:00:00Z',
    });
  });
  const save = async (next = faction, previous?: typeof faction) =>
    t.run(async (ctx) => {
      await ctx.db.patch(factionId, { data: next });
      return enqueueFactionLeaderPublications(ctx, { _id: factionId, data: next }, previous);
    });
  await save();
  const memberId = faction.leaders[0].memberId;
  return { t, faction, factionId, memberId, assetId: factionMemberPublicationId(factionId, memberId), save };
}

async function takeMember(t: ReturnType<typeof convexTest>, assetId: string) {
  const assignment = await t.mutation(internal.publicationJobs.takeWork, {});
  const job = assignment.items.find((item) => item.assetId === assetId);
  if (!job) {
    throw new Error('Member was not assigned');
  }
  const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId: job.jobId });
  return { ...job, payloadHash: snapshot!.payloadHash };
}

describe('Leader component publication lifecycle', () => {
  test('activation gates the new capture type and regeneration includes the existing ruler and roster', async () => {
    const { t, faction, assetId } = await fixture(false);
    expect((await t.mutation(internal.publicationJobs.takeWork, {})).items).toEqual([]);
    await t.run(async (ctx) => {
      const settings = await ctx.db.query('admin_settings').unique();
      await ctx.db.patch(settings!._id, { renderer_revisions: { 'faction-leader': 1 } });
      for (const job of await ctx.db.query('publication_jobs').collect()) {
        await ctx.db.delete(job._id);
      }
    });
    await t.mutation(internal.publicationRegeneration.scan, {
      assetType: 'faction-leader',
      cursor: null,
      scanned: 0,
      enqueued: 0,
    });
    const assignment = await t.mutation(internal.publicationJobs.takeWork, {});
    expect(assignment.items).toHaveLength(faction.leaders.length + 1);
    expect(assignment.items.some((item) => item.assetId === assetId)).toBe(true);
  });

  test('rename retains the URL, reordering does not republish, and shared artwork changes every image', async () => {
    const { t, faction, assetId, save } = await fixture();
    const job = await takeMember(t, assetId);
    await t.mutation(internal.publicationJobs.completeJob, {
      jobId: job.jobId,
      cacheToken: tokenA,
      payloadHash: job.payloadHash,
    });
    const reordered = { ...faction, leaders: [...faction.leaders].reverse() };
    expect(await save(reordered, faction)).toBe(0);
    const renamed = structuredClone(reordered);
    renamed.leaders.find((member) => member.memberId === faction.leaders[0].memberId)!.name = 'New name';
    expect(await save(renamed, reordered)).toBe(1);
    const replacement = await takeMember(t, assetId);
    expect(
      (await t.query(internal.publicationJobs.readJobForRender, { jobId: replacement.jobId }))?.payload
    ).toMatchObject({ leader: { name: 'New name' } });
    await t.mutation(internal.publicationJobs.completeJob, {
      jobId: replacement.jobId,
      cacheToken: tokenB,
      payloadHash: replacement.payloadHash,
    });
    expect(await t.query(internal.componentPublication.resolveDelivery, { assetId })).toMatchObject({
      status: 'found',
      revision: tokenB,
    });
    expect(await save({ ...renamed, logo: '/vector/logo/fremen.svg' }, renamed)).toBe(renamed.leaders.length + 1);
  });

  test('late capture cannot replace a newer component revision', async () => {
    const { t, faction, assetId, save } = await fixture();
    const old = await takeMember(t, assetId);
    const next = structuredClone(faction);
    next.leaders[0].strength = 9;
    await t.mutation(internal.publicationJobs.failJob, { jobId: old.jobId, error: 'Retry expired capture' });
    await save(next, faction);
    const replacement = await takeMember(t, assetId);
    expect(replacement.jobId).toBe(old.jobId);
    expect(
      await t.mutation(internal.publicationJobs.completeJob, {
        jobId: old.jobId,
        cacheToken: tokenA,
        payloadHash: old.payloadHash,
      })
    ).toEqual({ status: 'missing' });
    await t.mutation(internal.publicationJobs.completeJob, {
      jobId: replacement.jobId,
      cacheToken: tokenB,
      payloadHash: replacement.payloadHash,
    });
    expect(
      await t.mutation(internal.publicationJobs.completeJob, {
        jobId: old.jobId,
        cacheToken: tokenA,
        payloadHash: old.payloadHash,
      })
    ).toEqual({ status: 'missing' });
    expect(await t.query(internal.componentPublication.resolveDelivery, { assetId })).toMatchObject({
      revision: tokenB,
    });
  });

  test('removal makes retained bytes unavailable and rejects in-flight work without matching by name', async () => {
    const { t, faction, assetId, save } = await fixture();
    const old = await takeMember(t, assetId);
    const next = structuredClone(faction);
    const removed = next.leaders.shift()!;
    next.leaders.push({ ...removed, memberId: '10000000-1000-4000-8000-100000000003' });
    await save(next, faction);
    expect(await t.query(internal.publicationJobs.readJobForRender, { jobId: old.jobId })).toBeNull();
    expect(
      await t.mutation(internal.publicationJobs.completeJob, {
        jobId: old.jobId,
        cacheToken: tokenA,
        payloadHash: old.payloadHash,
      })
    ).toEqual({ status: 'missing' });
    expect(await t.query(internal.componentPublication.resolveDelivery, { assetId })).toEqual({
      ok: true,
      status: 'missing',
    });
  });
});
