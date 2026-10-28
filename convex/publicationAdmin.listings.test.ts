// @vitest-environment edge-runtime

import { afterEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

type JobInput = Omit<Doc<'publication_jobs'>, '_id' | '_creationTime'>;
const PAGE = { page: 1, pageSize: 2 };
const REQUIRED = ['publication_job_listings_v1', 'publication_job_listings_verify_v1'];

function job(index: number, status: JobInput['status'] = 'pending', assetType = 'board'): JobInput {
  return {
    asset_type: assetType,
    asset_id: `publication-${index}`,
    asset_data: { captured: 'x'.repeat(32 * 1024) },
    status,
    attempt_counter: index,
    created_at: index,
    updated_at: index,
  };
}

async function fixture() {
  const t = applicationTest();
  const admin = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Publication administrator', isAdmin: true })
  );
  return { t, admin: t.withIdentity({ subject: admin }) };
}

async function ready(t: ReturnType<typeof applicationTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert('migration_runs', {
      migration_id: 'publication_job_listings_verify_v1',
      state: 'success',
      is_done: true,
      processed: 1,
      latest_start: 1,
      latest_end: 2,
      updated_at: '2026-10-27T00:00:00.000Z',
    })
  );
}

async function mixedQueue(t: ReturnType<typeof applicationTest>) {
  return await t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    return [
      await ctx.db.insert('publication_jobs', job(1, 'pending')),
      await ctx.db.insert('publication_jobs', job(2, 'error', 'card')),
      await ctx.db.insert('publication_jobs', job(3, 'in_progress')),
      await ctx.db.insert('publication_jobs', job(4, 'error')),
    ];
  });
}

afterEach(() => vi.useRealTimers());

test('indexed admin pages retain status precedence, filters and live job transitions', async () => {
  const { t, admin } = await fixture();
  const ids = await mixedQueue(t);
  const legacy = await admin.query(api.publicationAdmin.page, PAGE);
  const marker = await ready(t);
  await t.run(async (ctx) => ctx.db.patch('migration_runs', marker, { state: 'failed' }));
  expect(await admin.query(api.publicationAdmin.page, PAGE)).toEqual(legacy);
  await t.run(async (ctx) => ctx.db.patch('migration_runs', marker, { state: 'success' }));
  expect(await admin.query(api.publicationAdmin.page, PAGE)).toEqual(legacy);
  expect(legacy.jobs.map((row) => row.id)).toEqual([ids[1], ids[3]]);
  expect(await admin.query(api.publicationAdmin.page, { ...PAGE, page: 2 })).toMatchObject({
    jobs: [{ id: ids[2] }, { id: ids[0] }],
    total: 4,
  });
  expect(await admin.query(api.publicationAdmin.page, { ...PAGE, assetType: 'board', status: 'error' })).toMatchObject({
    counts: { error: 2, inProgress: 1, pending: 1 },
    total: 1,
    jobs: [{ id: ids[3] }],
  });
  expect(await admin.query(api.publicationAdmin.page, { ...PAGE, assetType: 'missing' })).toMatchObject({
    total: 0,
    jobs: [],
  });
  expect(await admin.query(api.publicationAdmin.page, { ...PAGE, page: 100 })).toMatchObject({
    total: 4,
    page: 2,
    jobs: [{ id: ids[2] }, { id: ids[0] }],
  });
  await t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    await ctx.db.patch('publication_jobs', ids[0]!, { status: 'in_progress', expires_at: 999, updated_at: 99 });
    await ctx.db.patch('publication_jobs', ids[1]!, { status: 'pending', asset_type: 'board', error: 'Retrying' });
    await ctx.db.delete('publication_jobs', ids[3]!);
  });
  expect(
    await admin.query(api.publicationAdmin.page, { ...PAGE, status: 'pending', assetType: 'board' })
  ).toMatchObject({
    counts: { error: 0, inProgress: 2, pending: 1 },
    total: 1,
    jobs: [{ id: ids[1], error: 'Retrying' }],
  });
  expect(await admin.query(api.publicationAdmin.page, { ...PAGE, status: 'in_progress' })).toMatchObject({
    jobs: [{ id: ids[0], expiresAt: 999, updatedAt: 99 }, { id: ids[2] }],
  });
});

test('the backfill preserves source jobs, survives replay and enables the existing admin query', async () => {
  vi.useFakeTimers();
  const { t, admin } = await fixture();
  const id = await t.run(async (ctx) => ctx.db.insert('publication_jobs', job(1, 'error')));
  const before = await t.run(async (ctx) => ctx.db.get('publication_jobs', id));
  const legacy = await admin.query(api.publicationAdmin.page, PAGE);
  await t.mutation(internal.migrations.runRequired, { ids: REQUIRED });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await expect(t.query(internal.migrations.assertReadyForNarrow, { required: REQUIRED })).resolves.toMatchObject({
    ok: true,
  });
  expect(await admin.query(api.publicationAdmin.page, PAGE)).toEqual(legacy);
  expect(await t.run(async (ctx) => ctx.db.get('publication_jobs', id))).toEqual(before);
  await t.mutation(internal.publicationMigrations.publication_job_listings_v1, { reset: true });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await admin.query(api.publicationAdmin.page, PAGE)).toEqual(legacy);
});

/* Setup writes 1,101 jobs and their aggregate entries; give a busy runner time for that fixture. */
test('a deep filtered page stays below 128 KiB among 1,101 captured jobs', { timeout: 30_000 }, async () => {
  const { t, admin } = await fixture();
  for (let start = 0; start < 1101; start += 25) {
    await t.run(async (raw) => {
      const ctx = applicationTriggers.wrapDB(raw);
      for (let index = start; index < Math.min(start + 25, 1101); index += 1) {
        await ctx.db.insert('publication_jobs', job(index, 'pending', index % 2 ? 'card' : 'board'));
      }
    });
  }
  const marker = await ready(t);
  const args = { page: 22, pageSize: 25, assetType: 'board', status: 'pending' as const };
  const bounded = () =>
    admin.run(async (ctx) =>
      ctx.runQuery(api.publicationAdmin.page, args, {
        transactionLimits: { bytesRead: 128 * 1024 },
      })
    );
  const result = await bounded();
  expect(result.counts).toEqual({ error: 0, inProgress: 0, pending: 1101 });
  expect(result.total).toBe(551);
  expect(result.jobs).toHaveLength(25);
  expect(result.jobs[0]?.assetId).toBe('publication-1050');
  expect(result.jobs.at(-1)?.assetId).toBe('publication-1098');
  await t.run(async (ctx) => ctx.db.patch('migration_runs', marker, { is_done: false }));
  /* The same public query's rollout fallback proves full render-payload scans exceed this budget. */
  await expect(bounded()).rejects.toThrow(/Read too much data/);
});

test('cursor pages preserve ordering, filters and open traversals across migration cutover', async () => {
  const { t, admin } = await fixture();
  const ids = await mixedQueue(t);
  const firstArgs = { paginationOpts: { cursor: null, numItems: 2 } };
  const legacy = await admin.query(api.publicationAdmin.listing, firstArgs);
  await ready(t);
  const indexed = await admin.query(api.publicationAdmin.listing, firstArgs);
  expect(indexed.page).toEqual(legacy.page);
  expect(indexed.page.map((row) => row.id)).toEqual([ids[1], ids[3]]);
  for (const cursor of [legacy.continueCursor, indexed.continueCursor]) {
    const next = await admin.query(api.publicationAdmin.listing, { paginationOpts: { cursor, numItems: 2 } });
    expect(next.page.map((row) => row.id)).toEqual([ids[2], ids[0]]);
    expect(next.isDone).toBe(true);
  }
  const bounded = await admin.query(api.publicationAdmin.listing, {
    paginationOpts: { cursor: null, endCursor: indexed.continueCursor, numItems: 100 },
  });
  expect(bounded.page).toEqual(indexed.page);
  const filtered = await admin.query(api.publicationAdmin.listing, {
    assetType: 'board',
    status: 'error',
    ...firstArgs,
  });
  expect(filtered.page.map((row) => row.id)).toEqual([ids[3]]);
  expect(filtered.counts).toEqual({
    pending: { value: 1, limited: false },
    inProgress: { value: 1, limited: false },
    error: { value: 2, limited: false },
  });
  await t.run((raw) => applicationTriggers.wrapDB(raw).db.delete('publication_jobs', ids[0]!));
  const drained = await admin.query(api.publicationAdmin.listing, {
    paginationOpts: { cursor: indexed.continueCursor, numItems: 2 },
  });
  expect(drained.page.map((row) => row.id)).toEqual([ids[2]]);
});

test('current dashboard reads metadata within 128 KiB and refuses non-admin callers', async () => {
  const { t, admin } = await fixture();
  for (let index = 0; index < 30; index += 1) {
    await t.run((raw) =>
      applicationTriggers
        .wrapDB(raw)
        .db.insert('publication_jobs', { ...job(index), asset_data: { payload: 'x'.repeat(900_000) } })
    );
  }
  const marker = await ready(t);
  const args = { paginationOpts: { cursor: null, numItems: 25 } };
  const bounded = () =>
    admin.run((ctx) =>
      ctx.runQuery(api.publicationAdmin.listing, args, { transactionLimits: { bytesRead: 128 * 1024 } })
    );
  const first = await bounded();
  expect(first.page).toHaveLength(25);
  expect(first.counts.pending).toEqual({ value: 30, limited: false });
  const next = await admin.query(api.publicationAdmin.listing, {
    paginationOpts: { cursor: first.continueCursor, numItems: 25 },
  });
  expect(next.page).toHaveLength(5);
  expect(next.isDone).toBe(true);
  await expect(t.query(api.publicationAdmin.listing, args)).rejects.toThrow();
  const user = await t.run((ctx) => ctx.db.insert('users', { name: 'Ordinary user' }));
  await expect(t.withIdentity({ subject: user }).query(api.publicationAdmin.listing, args)).rejects.toThrow();
  await t.run((ctx) => ctx.db.patch('migration_runs', marker, { is_done: false }));
  await expect(bounded()).rejects.toThrow(/Read too much data/);
});
