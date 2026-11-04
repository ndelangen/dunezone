// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

type JobInput = Omit<Doc<'publication_jobs'>, '_id' | '_creationTime'>;

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

test('cursor pages keep status precedence, filters and open traversals', async () => {
  const { t, admin } = await fixture();
  const ids = await mixedQueue(t);
  const firstArgs = { paginationOpts: { cursor: null, numItems: 2 } };
  const indexed = await admin.query(api.publicationAdmin.listing, firstArgs);
  expect(indexed.page.map((row) => row.id)).toEqual([ids[1], ids[3]]);
  const next = await admin.query(api.publicationAdmin.listing, {
    paginationOpts: { cursor: indexed.continueCursor, numItems: 2 },
  });
  expect(next.page.map((row) => row.id)).toEqual([ids[2], ids[0]]);
  expect(next.isDone).toBe(true);
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
  expect(filtered.counts).toEqual({ pending: 1, inProgress: 1, error: 2 });
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
  const args = { paginationOpts: { cursor: null, numItems: 25 } };
  const bounded = () =>
    admin.run((ctx) =>
      ctx.runQuery(api.publicationAdmin.listing, args, { transactionLimits: { bytesRead: 128 * 1024 } })
    );
  const first = await bounded();
  expect(first.page).toHaveLength(25);
  expect(first.counts.pending).toBe(30);
  const next = await admin.query(api.publicationAdmin.listing, {
    paginationOpts: { cursor: first.continueCursor, numItems: 25 },
  });
  expect(next.page).toHaveLength(5);
  expect(next.isDone).toBe(true);
  await expect(t.query(api.publicationAdmin.listing, args)).rejects.toThrow();
  const user = await t.run((ctx) => ctx.db.insert('users', { name: 'Ordinary user' }));
  await expect(t.withIdentity({ subject: user }).query(api.publicationAdmin.listing, args)).rejects.toThrow();
});
