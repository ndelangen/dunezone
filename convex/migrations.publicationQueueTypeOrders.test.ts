// @vitest-environment edge-runtime
import { DirectAggregate } from '@convex-dev/aggregate';
import { expect, test } from 'vite-plus/test';

import { api, components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

type Namespace = [string, 'type', string] | [string, 'all'];
const queue = new DirectAggregate<{
  Namespace: Namespace;
  Key: [number, number, Id<'publication_jobs'>];
  Id: Id<'publication_job_listings'>;
}>(components.publicationQueue);

test('the retired per-type order entries go, the status order stays, and a replay changes nothing', async () => {
  const t = applicationTest();
  const adminId = await t.run((ctx) => ctx.db.insert('users', { isAdmin: true }));
  await t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    const jobId = await ctx.db.insert('publication_jobs', {
      asset_type: 'card-storm',
      asset_id: 'fixture',
      asset_data: {},
      status: 'error',
      attempt_counter: 1,
      created_at: 1,
      updated_at: 1,
    });
    const job = (await ctx.db.get('publication_jobs', jobId))!;
    const listing = (await ctx.db
      .query('publication_job_listings')
      .withIndex('by_job', (q) => q.eq('job_id', jobId))
      .unique())!;
    const key: [number, number, Id<'publication_jobs'>] = [job.created_at, job._creationTime, jobId];
    /* As the earlier trigger left them: one under the status the job holds and one under a status it held before. */
    for (const status of ['error', 'pending']) {
      await queue.insert(raw, { namespace: [status, 'type', 'card-storm'], key, id: listing._id });
    }
  });
  const typed = () =>
    t.run((ctx) =>
      Promise.all(
        ['error', 'in_progress', 'pending'].map((s) => queue.count(ctx, { namespace: [s, 'type', 'card-storm'] }))
      )
    );
  expect(await typed()).toEqual([1, 0, 1]);
  await t.mutation(internal.publicationMigrations.publication_queue_type_orders_drop_v1, {});
  expect(await typed()).toEqual([0, 0, 0]);
  await t.mutation(internal.publicationMigrations.publication_queue_type_orders_drop_v1, { reset: true });
  expect(await typed()).toEqual([0, 0, 0]);
  const listing = await t
    .withIdentity({ subject: adminId })
    .query(api.publicationAdmin.listing, { paginationOpts: { cursor: null, numItems: 10 } });
  expect(listing.counts).toEqual({ error: 1, inProgress: 0, pending: 0 });
  expect(listing.page).toHaveLength(1);
});
