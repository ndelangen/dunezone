/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const CACHE_TOKEN = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;

async function authenticatedTest(options: { admin?: boolean } = {}) {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'homepageCommunity');
  const userId = await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        name: options.admin ? 'Publication admin' : 'Publication author',
        isAdmin: options.admin,
      })
  );
  return { t, userId, asUser: t.withIdentity({ subject: userId }) };
}

async function createFaction(
  asUser: Awaited<ReturnType<typeof authenticatedTest>>['asUser'],
  name = 'Publication proof'
) {
  return await asUser.mutation(api.factions.create, {
    data: { ...assetPublishingFaction, name },
    group_id: null,
  });
}

async function jobsFor(t: ReturnType<typeof convexTest>, factionId: Id<'factions'>) {
  return await t.run(async (ctx) =>
    (await ctx.db.query('publication_jobs').collect()).filter(
      (job) => job.asset_type === 'faction_sheet' && job.asset_id === factionId
    )
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Publication save coalescing', () => {
  test('updates one pending job payload and resets its attempts', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const [pending] = await jobsFor(t, faction._id);
    if (!pending) {
      throw new Error('Missing pending job');
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(pending._id, {
        attempt_counter: 7,
        error: 'Earlier failure',
      });
    });

    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Publication proof revised' },
    });

    const jobs = await jobsFor(t, faction._id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      _id: pending._id,
      status: 'pending',
      attempt_counter: 0,
      asset_data: {
        factionId: faction._id,
        slug: 'publication-proof-revised',
        faction: { name: 'Publication proof revised' },
      },
    });
    expect(jobs[0]).not.toHaveProperty('error');
  });

  test('a first save creates one self-contained pending job', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);

    await expect(jobsFor(t, faction._id)).resolves.toEqual([
      expect.objectContaining({
        asset_type: 'faction_sheet',
        asset_id: faction._id,
        status: 'pending',
        attempt_counter: 0,
        asset_data: {
          factionId: faction._id,
          slug: 'publication-proof',
          faction: expect.objectContaining({ name: 'Publication proof' }),
        },
      }),
    ]);
  });

  test('keeps in-progress work and creates one pending successor with the latest save', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const [first] = await jobsFor(t, faction._id);
    if (!first) {
      throw new Error('Missing first job');
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(first._id, {
        status: 'in_progress',
        expires_at: Date.now() + 60_000,
      });
    });

    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Saved while capturing' },
    });
    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Latest save while capturing' },
    });
    const beforeComplete = await jobsFor(t, faction._id);
    expect(beforeComplete.map((job) => job.status).sort()).toEqual(['in_progress', 'pending']);
    expect(beforeComplete.find((job) => job.status === 'pending')).toMatchObject({
      asset_data: { faction: { name: 'Latest save while capturing' } },
    });

    await t.mutation(internal.publicationJobs.completeJob, {
      jobId: first._id,
      cacheToken: CACHE_TOKEN,
    });
    const remaining = await jobsFor(t, faction._id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      status: 'pending',
      asset_data: { faction: { name: 'Latest save while capturing' } },
    });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query('publication_assets')
            .withIndex('by_asset_type_and_asset_id', (q) =>
              q.eq('asset_type', 'faction_sheet').eq('asset_id', faction._id)
            )
            .unique()
      )
    ).resolves.toMatchObject({ cache_token: CACHE_TOKEN });
  });

  test('a new save replaces an error job with a fresh pending job', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const [job] = await jobsFor(t, faction._id);
    if (!job) {
      throw new Error('Missing job');
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(job._id, {
        status: 'error',
        attempt_counter: 10,
        error: 'Ten failed attempts',
      });
    });

    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Fresh save after error' },
    });
    const [replacement] = await jobsFor(t, faction._id);
    expect(replacement).toMatchObject({
      status: 'pending',
      attempt_counter: 0,
    });
    expect(replacement).not.toHaveProperty('error');
    expect(replacement?._id).not.toBe(job._id);
  });
});

describe('Publication pickup, recovery, and failure', () => {
  test('always recovers expired work while disabled but does not pick up pending work', async () => {
    const { t, asUser } = await authenticatedTest();
    await t.mutation(internal.publicationAdmin.initialize, {
      rendererRevisions: { faction_sheet: 4 },
    });
    const expiredFaction = await createFaction(asUser, 'Expired capture');
    const pendingFaction = await createFaction(asUser, 'Still pending');
    const [expired] = await jobsFor(t, expiredFaction._id);
    if (!expired) {
      throw new Error('Missing expired job');
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(expired._id, {
        status: 'in_progress',
        attempt_counter: 8,
        expires_at: Date.now() - 1,
      });
    });

    await expect(t.mutation(internal.publicationJobs.takeWork, {})).resolves.toEqual({
      status: 'empty',
      reason: 'disabled',
      recovered: 1,
      items: [],
    });
    expect((await jobsFor(t, expiredFaction._id))[0]).toMatchObject({
      status: 'pending',
      attempt_counter: 9,
    });
    expect((await jobsFor(t, pendingFaction._id))[0]).toMatchObject({
      status: 'pending',
      attempt_counter: 0,
    });
  });

  test('the tenth explicit capture failure becomes an error job', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const [job] = await jobsFor(t, faction._id);
    if (!job) {
      throw new Error('Missing job');
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(job._id, {
        status: 'in_progress',
        attempt_counter: 9,
        expires_at: Date.now() + 60_000,
      });
    });

    await expect(
      t.mutation(internal.publicationJobs.failJob, {
        jobId: job._id,
        error: 'Invalid PDF',
      })
    ).resolves.toEqual({ status: 'error', attemptCounter: 10 });
    expect((await jobsFor(t, faction._id))[0]).toMatchObject({
      status: 'error',
      attempt_counter: 10,
      error: 'Invalid PDF',
    });
  });

  test('the tenth expiry recovery becomes an error job', async () => {
    const { t, asUser } = await authenticatedTest();
    await t.mutation(internal.publicationAdmin.initialize, {
      rendererRevisions: { faction_sheet: 4 },
    });
    const faction = await createFaction(asUser);
    const [job] = await jobsFor(t, faction._id);
    if (!job) {
      throw new Error('Missing job');
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(job._id, {
        status: 'in_progress',
        attempt_counter: 9,
        expires_at: Date.now() - 1,
      });
    });

    await expect(t.mutation(internal.publicationJobs.takeWork, {})).resolves.toMatchObject({
      status: 'empty',
      reason: 'disabled',
      recovered: 1,
    });
    expect((await jobsFor(t, faction._id))[0]).toMatchObject({
      status: 'error',
      attempt_counter: 10,
      error: 'Capture expired before completion',
    });
  });

  test('turning pickup off does not cancel work already in progress', async () => {
    const { t, asUser } = await authenticatedTest();
    await t.mutation(internal.publicationAdmin.initialize, {
      rendererRevisions: { faction_sheet: 4 },
    });
    const adminId = await t.run(
      async (ctx) => await ctx.db.insert('users', { name: 'Admin', isAdmin: true })
    );
    const asAdmin = t.withIdentity({ subject: adminId });
    await asAdmin.mutation(api.publicationAdmin.setPickupEnabled, { enabled: true });
    const faction = await createFaction(asUser);

    const work = await t.mutation(internal.publicationJobs.takeWork, {});
    if (work.status !== 'assigned') {
      throw new Error('Expected assigned work');
    }
    await asAdmin.mutation(api.publicationAdmin.setPickupEnabled, { enabled: false });
    await expect(
      t.mutation(internal.publicationJobs.completeJob, {
        jobId: work.items[0].jobId,
        cacheToken: CACHE_TOKEN,
      })
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(jobsFor(t, faction._id)).resolves.toHaveLength(0);
  });
});

describe('Publication regeneration and administration', () => {
  test('soft delete does not cancel queued work and regeneration excludes deleted factions', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const [queued] = await jobsFor(t, faction._id);
    if (!queued) {
      throw new Error('Missing job');
    }

    await asUser.mutation(api.factions.softDelete, { id: faction._id });
    expect(await jobsFor(t, faction._id)).toHaveLength(1);
    await t.run(async (ctx) => await ctx.db.delete(queued._id));
    await t.mutation(internal.publicationRegeneration.scan, {
      assetType: 'faction_sheet',
      cursor: null,
      scanned: 0,
      enqueued: 0,
    });
    expect(await jobsFor(t, faction._id)).toHaveLength(0);
  });

  test('restarting a Regeneration scan coalesces into the existing pending job', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const [saveJob] = await jobsFor(t, faction._id);
    if (!saveJob) {
      throw new Error('Missing save job');
    }
    await t.run(async (ctx) => await ctx.db.delete(saveJob._id));

    for (let scan = 0; scan < 2; scan += 1) {
      await t.mutation(internal.publicationRegeneration.scan, {
        assetType: 'faction_sheet',
        cursor: null,
        scanned: 0,
        enqueued: 0,
      });
    }

    await expect(jobsFor(t, faction._id)).resolves.toHaveLength(1);
  });

  test('restoring and editing a soft-deleted faction schedules a fresh capture', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const [queued] = await jobsFor(t, faction._id);
    if (!queued) {
      throw new Error('Missing job');
    }
    await t.run(async (ctx) => await ctx.db.delete(queued._id));
    await asUser.mutation(api.factions.softDelete, { id: faction._id });
    await t.run(async (ctx) => await ctx.db.patch(faction._id, { is_deleted: false }));

    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Restored faction' },
    });

    await expect(jobsFor(t, faction._id)).resolves.toEqual([
      expect.objectContaining({
        status: 'pending',
        attempt_counter: 0,
        asset_data: {
          factionId: faction._id,
          slug: 'restored-faction',
          faction: expect.objectContaining({ name: 'Restored faction' }),
        },
      }),
    ]);
  });

  test('initialization is disabled, equal revisions are inert, and only higher revisions scan', async () => {
    vi.useFakeTimers();
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const [saveJob] = await jobsFor(t, faction._id);
    if (!saveJob) {
      throw new Error('Missing save job');
    }
    await t.run(async (ctx) => await ctx.db.delete(saveJob._id));

    await expect(
      t.mutation(internal.publicationAdmin.initialize, {
        rendererRevisions: { faction_sheet: 4 },
      })
    ).resolves.toMatchObject({
      publicationPickupEnabled: false,
      rendererRevisions: { faction_sheet: 4 },
    });
    await expect(
      t.mutation(internal.publicationAdmin.activateRevisions, {
        rendererRevisions: { faction_sheet: 4 },
      })
    ).resolves.toEqual({
      changedAssetTypes: [],
      rendererRevisions: { faction_sheet: 4 },
    });
    expect(await jobsFor(t, faction._id)).toHaveLength(0);

    await expect(
      t.mutation(internal.publicationAdmin.activateRevisions, {
        rendererRevisions: { faction_sheet: 5 },
      })
    ).resolves.toEqual({
      changedAssetTypes: ['faction_sheet'],
      rendererRevisions: { faction_sheet: 5 },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await jobsFor(t, faction._id)).toHaveLength(1);
    await expect(
      t.mutation(internal.publicationAdmin.activateRevisions, {
        rendererRevisions: { faction_sheet: 4 },
      })
    ).rejects.toThrow(/behind the stored revision/);
  });

  test('the jobs page returns no data without admin access and admins control pickup', async () => {
    const { t, asUser } = await authenticatedTest();
    await t.mutation(internal.publicationAdmin.initialize, {
      rendererRevisions: { faction_sheet: 4 },
    });

    await expect(t.query(api.publicationAdmin.page, { page: 1, pageSize: 25 })).resolves.toEqual({
      access: 'unauthenticated',
    });
    await expect(
      asUser.query(api.publicationAdmin.page, { page: 1, pageSize: 25 })
    ).resolves.toEqual({ access: 'not_authorized' });
    await expect(
      asUser.mutation(api.publicationAdmin.setPickupEnabled, { enabled: true })
    ).rejects.toThrow(/Not authorized/);

    const adminId = await t.run(
      async (ctx) => await ctx.db.insert('users', { name: 'Admin', isAdmin: true })
    );
    const asAdmin = t.withIdentity({ subject: adminId });
    await expect(
      asAdmin.mutation(api.publicationAdmin.setPickupEnabled, { enabled: true })
    ).resolves.toMatchObject({ publicationPickupEnabled: true });
    await expect(
      asAdmin.query(api.publicationAdmin.page, { page: 1, pageSize: 25 })
    ).resolves.toMatchObject({
      access: 'admin',
      settings: {
        publicationPickupEnabled: true,
        rendererRevisions: { faction_sheet: 4 },
      },
      jobs: [],
    });
  });
});
