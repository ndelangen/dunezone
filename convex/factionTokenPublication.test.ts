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
      for (const job of await ctx.db.query('publication_jobs').collect()) {
        await ctx.db.delete(job._id);
      }
    });
    await t.mutation(internal.publicationRegeneration.scan, {
      assetType: 'faction-token',
      cursor: null,
      scanned: 0,
      enqueued: 0,
    });
    const assignment = await t.mutation(internal.publicationJobs.takeWork, {});
    expect(assignment.items).toHaveLength(1);
    const job = assignment.items[0]!;
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
});
