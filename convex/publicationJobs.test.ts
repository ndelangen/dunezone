/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { PUBLICATION_MAX_PICKUP, takeWorkResultSchema } from '../src/shared/asset-publishing/publication';
import { ensureFactionComponentIds } from '../src/shared/factions/componentIdentity';
import { assetPublishingFaction as legacyFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import schema from './schema';

const assetPublishingFaction = ensureFactionComponentIds(legacyFaction);

const modules = import.meta.glob('./**/*.ts');
const CACHE_TOKEN = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;

async function authenticatedTest(options: { admin?: boolean } = {}) {
  const t = applicationTest();
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
  test('takeWork output parses against the shared executor wire schema', async () => {
    const t = applicationTest();
    const empty = await t.mutation(internal.publicationJobs.takeWork, {});
    expect(() => takeWorkResultSchema.parse(empty)).not.toThrow();
  });

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

    const [queued] = await jobsFor(t, faction._id);
    if (!queued) {
      throw new Error('Missing job');
    }
    await t.run(async (ctx) => await ctx.db.delete(queued._id));
    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Publication proof revised' },
    });

    await expect(jobsFor(t, faction._id)).resolves.toEqual([
      expect.objectContaining({
        status: 'pending',
        attempt_counter: 0,
        asset_data: {
          factionId: faction._id,
          slug: 'publication-proof-revised',
          faction: expect.objectContaining({ name: 'Publication proof revised' }),
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
    expect(beforeComplete.map((job) => job.status).sort((first, second) => first.localeCompare(second))).toEqual([
      'in_progress',
      'pending',
    ]);
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

  test('turning pickup off does not cancel work already in progress', async () => {
    const { t, asUser } = await authenticatedTest();
    await t.mutation(internal.publicationAdmin.initialize, {
      rendererRevisions: { faction_sheet: 4 },
    });
    const adminId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Admin', isAdmin: true }));
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

describe('Publication captures one job per asset at a time', () => {
  async function capturingWithSuccessor() {
    const { t, asUser } = await authenticatedTest();
    await t.mutation(internal.publicationAdmin.initialize, {
      rendererRevisions: { faction_sheet: 4 },
    });
    const adminId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Admin', isAdmin: true }));
    await t.withIdentity({ subject: adminId }).mutation(api.publicationAdmin.setPickupEnabled, { enabled: true });
    const faction = await createFaction(asUser);
    const first = await t.mutation(internal.publicationJobs.takeWork, {});
    if (first.status !== 'assigned') {
      throw new Error('Expected assigned work');
    }
    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Saved while capturing' },
    });
    return { t, faction, firstJobId: first.items[0].jobId };
  }

  test('a successor is not handed out while its predecessor is still capturing', async () => {
    const { t, faction, firstJobId } = await capturingWithSuccessor();
    await expect(t.mutation(internal.publicationJobs.takeWork, {})).resolves.toMatchObject({ items: [] });
    await t.mutation(internal.publicationJobs.completeJob, { jobId: firstJobId, cacheToken: CACHE_TOKEN });
    const next = await t.mutation(internal.publicationJobs.takeWork, {});
    expect(next.items).toHaveLength(1);
    expect((await jobsFor(t, faction._id)).map((job) => job.status)).toEqual(['in_progress']);
  });

  test('a failed capture with a newer save queued is dropped instead of retried', async () => {
    const { t, faction, firstJobId } = await capturingWithSuccessor();
    await expect(
      t.mutation(internal.publicationJobs.failJob, { jobId: firstJobId, error: 'Timed out' })
    ).resolves.toEqual({ status: 'missing' });
    const remaining = await jobsFor(t, faction._id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      status: 'pending',
      asset_data: { faction: { name: 'Saved while capturing' } },
    });
  });
  test('held successors do not fill the batch and keep other work waiting', async () => {
    const { t, asUser } = await authenticatedTest();
    await t.mutation(internal.publicationAdmin.initialize, { rendererRevisions: { faction_sheet: 4 } });
    const adminId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Admin', isAdmin: true }));
    await t.withIdentity({ subject: adminId }).mutation(api.publicationAdmin.setPickupEnabled, { enabled: true });
    /* Twenty assets mid-capture, each with a successor queued ahead of an unrelated save. */
    for (let index = 0; index < 20; index += 1) {
      const faction = await createFaction(asUser, `Busy ${index}`);
      const [job] = await jobsFor(t, faction._id);
      await t.run(async (ctx) => {
        await ctx.db.patch(job!._id, { status: 'in_progress', expires_at: Date.now() + 60_000 });
      });
      await asUser.mutation(api.factions.update, {
        id: faction._id,
        data: { ...assetPublishingFaction, name: `Busy ${index} saved again` },
      });
    }
    const waiting = await createFaction(asUser, 'Waiting behind them');
    /* The first pickup clears the leader faces queued before their renderer was activated; none are held. */
    await t.mutation(internal.publicationJobs.takeWork, {});
    const work = await t.mutation(internal.publicationJobs.takeWork, {});

    expect(work.items.map((item) => item.assetId)).toEqual([waiting._id]);
    expect(
      (await t.run(async (ctx) => await ctx.db.query('publication_jobs').collect())).filter(
        (job) => job.asset_type === 'faction-leader'
      )
    ).toEqual([]);
  });

  test('of two overlapping captures that both expire, the newer save is the one kept', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const [older] = await jobsFor(t, faction._id);
    const newerId = await t.run(async (ctx) => {
      await ctx.db.patch(older!._id, { status: 'in_progress', expires_at: Date.now() - 2 });
      const { _id, _creationTime, ...row } = (await ctx.db.get('publication_jobs', older!._id))!;
      return await ctx.db.insert('publication_jobs', {
        ...row,
        asset_data: { ...row.asset_data, faction: { ...row.asset_data.faction, name: 'Newer save' } },
        expires_at: Date.now() - 1,
      });
    });

    await t.mutation(internal.publicationJobs.takeWork, {});

    expect((await jobsFor(t, faction._id)).map((job) => job._id)).toContain(newerId);
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

  test('the jobs page refuses everyone but admins, and admins control pickup', async () => {
    const { t, asUser } = await authenticatedTest();
    await t.mutation(internal.publicationAdmin.initialize, {
      rendererRevisions: { faction_sheet: 4 },
    });

    await expect(t.query(api.publicationAdmin.page, { page: 1, pageSize: 25 })).rejects.toThrow(/Not authenticated/);
    await expect(asUser.query(api.publicationAdmin.page, { page: 1, pageSize: 25 })).rejects.toThrow(/Not authorized/);
    await expect(asUser.mutation(api.publicationAdmin.setPickupEnabled, { enabled: true })).rejects.toThrow(
      /Not authorized/
    );

    const adminId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Admin', isAdmin: true }));
    const asAdmin = t.withIdentity({ subject: adminId });
    await expect(asAdmin.mutation(api.publicationAdmin.setPickupEnabled, { enabled: true })).resolves.toMatchObject({
      publicationPickupEnabled: true,
    });
    await expect(asAdmin.query(api.publicationAdmin.page, { page: 1, pageSize: 25 })).resolves.toMatchObject({
      settings: {
        publicationPickupEnabled: true,
        rendererRevisions: { faction_sheet: 4 },
      },
      jobs: [],
    });
  });
});

describe('Publication pickup read budget', () => {
  async function largeJobs(jobs: Array<{ status: 'pending' | 'in_progress'; assetId: string; createdAt: number }>) {
    const t = convexTest({ schema, modules, transactionLimits: true });
    await t.run(async (ctx) => {
      await ctx.db.insert('admin_settings', {
        key: 'publication',
        publication_pickup_enabled: true,
        renderer_revisions: {},
        updated_at: Date.now(),
      });
    });
    /* Board jobs carry their whole definition, so a few dozen of these pass what one transaction may read. */
    for (const job of jobs) {
      await t.run(async (ctx) => {
        await ctx.db.insert('publication_jobs', {
          asset_type: 'board',
          asset_id: job.assetId,
          asset_data: { padding: 'x'.repeat(900_000) },
          status: job.status,
          attempt_counter: 0,
          ...(job.status === 'in_progress' ? { expires_at: 1 } : {}),
          created_at: job.createdAt,
          updated_at: job.createdAt,
        });
      });
    }
    return t;
  }

  test('a queue of large pending jobs is picked up within the read limit', async () => {
    const t = await largeJobs(
      Array.from({ length: 40 }, (_, index) => ({
        status: 'pending' as const,
        assetId: `board-${index}`,
        createdAt: index,
      }))
    );
    const assignment = await t.mutation(internal.publicationJobs.takeWork, {});
    expect(assignment.items.length).toBeGreaterThan(0);
  });

  test('large expired captures with pending successors are recovered within the read limit', async () => {
    const t = await largeJobs(
      Array.from({ length: 20 }, (_, index) => [
        { status: 'in_progress' as const, assetId: `board-${index}`, createdAt: index },
        { status: 'pending' as const, assetId: `board-${index}`, createdAt: 100 + index },
      ]).flat()
    );
    const first = await t.mutation(internal.publicationJobs.takeWork, {});
    /* Twenty expired captures fit the pickup cap, so stopping short of it proves the read headroom ended the call. */
    expect(first.recovered).toBeGreaterThan(0);
    expect(first.recovered).toBeLessThan(PUBLICATION_MAX_PICKUP);
    /* Later calls finish the recovery the first one left for want of headroom. */
    let recovered = first.recovered;
    for (let call = 0; call < 20 && recovered < 20; call += 1) {
      recovered += (await t.mutation(internal.publicationJobs.takeWork, {})).recovered;
    }
    expect(recovered).toBe(20);
    const left = await t.run(async (ctx) =>
      ctx.db
        .query('publication_jobs')
        .withIndex('by_status_and_expires_at', (q) => q.eq('status', 'in_progress').lte('expires_at', 1))
        .collect()
    );
    expect(left).toEqual([]);
  });
});
