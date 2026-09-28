/* @vitest-environment edge-runtime */
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

describe('Faction token publication', () => {
  test('activation publishes existing tokens and only artwork changes enqueue a successor', async () => {
    const { t, owner } = await rulebookFixture();
    const data = structuredClone(assetPublishingFaction);
    const faction = await owner.mutation(api.factions.create, { data, group_id: null });
    const factionId = faction._id;
    await t.run(async (ctx) => {
      await ctx.db.insert('admin_settings', {
        key: 'publication',
        publication_pickup_enabled: true,
        renderer_revisions: {},
        updated_at: 1,
      });
    });
    expect(
      (await t.mutation(internal.publicationJobs.takeWork, {})).items.filter(
        (item) => item.assetType === 'faction-token'
      )
    ).toEqual([]);
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query('admin_settings')
        .withIndex('by_key', (q) => q.eq('key', 'publication'))
        .unique();
      await ctx.db.patch(settings!._id, { renderer_revisions: { 'faction-token': 1 } });
    });
    await t.mutation(internal.publicationRegeneration.scan, {
      assetType: 'faction-token',
      cursor: null,
      scanned: 0,
      enqueued: 0,
    });
    const assignment = await t.mutation(internal.publicationJobs.takeWork, {});
    const tokenJobs = assignment.items.filter((item) => item.assetType === 'faction-token');
    expect(tokenJobs).toHaveLength(1);
    const job = tokenJobs[0]!;
    expect(job).toMatchObject({ assetType: 'faction-token', assetId: factionId });
    const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId: job.jobId });
    expect(snapshot).toMatchObject({
      assetType: 'faction-token',
      payload: { logo: data.logo, background: data.background },
    });
    await t.mutation(internal.publicationJobs.completeJob, { jobId: job.jobId, cacheToken: 'token-one' });
    const renamed = { ...faction.data, name: 'Renamed' };
    await owner.mutation(api.factions.update, { id: factionId, data: renamed });
    expect(
      (await t.mutation(internal.publicationJobs.takeWork, {})).items.filter(
        (item) => item.assetType === 'faction-token'
      )
    ).toEqual([]);
    await owner.mutation(api.factions.update, { id: factionId, data: { ...renamed, logo: '/vector/logo/fremen.svg' } });
    expect(
      (await t.mutation(internal.publicationJobs.takeWork, {})).items.filter(
        (item) => item.assetType === 'faction-token'
      )
    ).toHaveLength(1);
  });

  test('revision 2 publishes the blocked back beside the front, and only artwork changes enqueue either face', async () => {
    const { t, owner } = await rulebookFixture();
    const data = structuredClone(assetPublishingFaction);
    const faction = await owner.mutation(api.factions.create, { data, group_id: null });
    const factionId = faction._id;
    await t.run(async (ctx) => {
      await ctx.db.insert('admin_settings', {
        key: 'publication',
        publication_pickup_enabled: true,
        renderer_revisions: { 'faction-token': 2 },
        updated_at: 1,
      });
    });
    await t.mutation(internal.publicationRegeneration.scan, {
      assetType: 'faction-token',
      cursor: null,
      scanned: 0,
      enqueued: 0,
    });
    const tokenJobs = (await t.mutation(internal.publicationJobs.takeWork, {})).items.filter(
      (item) => item.assetType === 'faction-token'
    );
    expect(tokenJobs.map((job) => job.assetId).sort()).toEqual([factionId, `${factionId}.back`].sort());
    const back = tokenJobs.find((job) => job.assetId === `${factionId}.back`)!;
    expect(await t.query(internal.publicationJobs.readJobForRender, { jobId: back.jobId })).toMatchObject({
      assetType: 'faction-token',
      payload: { logo: data.logo, background: data.background, blocked: true },
    });
    for (const job of tokenJobs) {
      await t.mutation(internal.publicationJobs.completeJob, { jobId: job.jobId, cacheToken: 'token-one' });
    }

    const renamed = { ...faction.data, name: 'Renamed' };
    await owner.mutation(api.factions.update, { id: factionId, data: renamed });
    expect(
      (await t.mutation(internal.publicationJobs.takeWork, {})).items.filter(
        (item) => item.assetType === 'faction-token'
      )
    ).toEqual([]);
    await owner.mutation(api.factions.update, { id: factionId, data: { ...renamed, logo: '/vector/logo/fremen.svg' } });
    expect(
      (await t.mutation(internal.publicationJobs.takeWork, {})).items
        .filter((item) => item.assetType === 'faction-token')
        .map((item) => item.assetId)
        .sort()
    ).toEqual([factionId, `${factionId}.back`].sort());
  });

  test('a revision rolled back below the blocked face holds its `.back` jobs and still hands out the front', async () => {
    const { t, owner } = await rulebookFixture();
    const faction = await owner.mutation(api.factions.create, {
      data: structuredClone(assetPublishingFaction),
      group_id: null,
    });
    const settingsId = await t.run(async (ctx) =>
      ctx.db.insert('admin_settings', {
        key: 'publication',
        publication_pickup_enabled: true,
        renderer_revisions: { 'faction-token': 2 },
        updated_at: 1,
      })
    );
    await t.mutation(internal.publicationRegeneration.scan, {
      assetType: 'faction-token',
      cursor: null,
      scanned: 0,
      enqueued: 0,
    });
    await t.run(async (ctx) => ctx.db.patch(settingsId, { renderer_revisions: { 'faction-token': 1 } }));
    const taken = async () =>
      (await t.mutation(internal.publicationJobs.takeWork, {})).items
        .filter((item) => item.assetType === 'faction-token')
        .map((item) => item.assetId);
    expect(await taken()).toEqual([faction._id]);
    await t.run(async (ctx) => ctx.db.patch(settingsId, { renderer_revisions: { 'faction-token': 2 } }));
    expect(await taken()).toEqual([`${faction._id}.back`]);
  });
});
