/* @vitest-environment edge-runtime */
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { internal } from './_generated/api';
import { enqueueFactionTokenPublication } from './lib/publication';
import { rulebookFixture } from './rulebooks.test.fixture';

describe('Faction token publication', () => {
  test('activation publishes existing tokens and only artwork changes enqueue a successor', async () => {
    const { t, ids } = await rulebookFixture();
    const data = structuredClone(assetPublishingFaction);
    const factionId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('factions', {
        owner_id: ids.ownerId,
        group_id: null,
        slug: 'token-proof',
        data,
        is_deleted: false,
        created_at: '2026-09-14',
        updated_at: '2026-09-14',
      });
      await ctx.db.insert('admin_settings', {
        key: 'publication',
        publication_pickup_enabled: true,
        renderer_revisions: {},
        updated_at: 1,
      });
      await enqueueFactionTokenPublication(ctx, { _id: id, data });
      return id;
    });
    expect((await t.mutation(internal.publicationJobs.takeWork, {})).items).toEqual([]);
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query('admin_settings')
        .withIndex('by_key', (q) => q.eq('key', 'publication'))
        .unique();
      await ctx.db.patch(settings!._id, { renderer_revisions: { 'faction-token': 1 } });
      for (const job of await ctx.db.query('publication_jobs').collect()) await ctx.db.delete(job._id);
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
    expect(
      await t.run((ctx) =>
        enqueueFactionTokenPublication(ctx, { _id: factionId, data: { ...data, name: 'Renamed' } }, data)
      )
    ).toBeNull();
    expect(
      await t.run((ctx) =>
        enqueueFactionTokenPublication(
          ctx,
          { _id: factionId, data: { ...data, logo: '/vector/logo/fremen.svg' } },
          data
        )
      )
    ).not.toBeNull();
  });
});
