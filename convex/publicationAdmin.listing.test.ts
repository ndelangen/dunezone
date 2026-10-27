// @vitest-environment edge-runtime
import type { FunctionReturnType } from 'convex/server';
import { expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

/* Queue fixtures insert up to 1,001 jobs and traverse every page under enforced transaction limits. */

async function queue(size: number, large = false) {
  const t = applicationTest({ transactionLimits: true });
  const adminId = await t.run((ctx) => ctx.db.insert('users', { isAdmin: true }));
  for (let index = 0; index < size; index += 1) {
    await t.run((ctx) =>
      ctx.db.insert('publication_jobs', {
        asset_type: index === size - 1 ? 'card-custom' : 'card-storm',
        asset_id: `fixture-${index}`,
        asset_data: large ? { padding: 'x'.repeat(900_000) } : {},
        status: 'pending',
        attempt_counter: 0,
        created_at: index,
        updated_at: index,
      })
    );
  }
  return { t, admin: t.withIdentity({ subject: adminId }) };
}

test('filtering and paging reach jobs beyond the first thousand', { timeout: 30_000 }, async () => {
  const { admin } = await queue(1001);
  const filtered = await admin.query(api.publicationAdmin.listing, {
    assetType: 'card-custom',
    paginationOpts: { cursor: null, numItems: 25 },
  });
  expect(filtered.page.map((job) => job.assetId)).toEqual(['fixture-1000']);
  expect(filtered.counts.pending).toEqual({ value: 1000, limited: true });
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < 11; index += 1) {
    const page: FunctionReturnType<typeof api.publicationAdmin.listing> = await admin.query(
      api.publicationAdmin.listing,
      { paginationOpts: { cursor, numItems: 100 } }
    );
    seen.push(...page.page.map((job) => job.assetId));
    cursor = page.continueCursor;
    if (page.isDone) {
      break;
    }
  }
  expect(seen).toHaveLength(1001);
  expect(new Set(seen).size).toBe(1001);
  expect(seen.at(-1)).toBe('fixture-1000');
});

test('earlier cursors still work after the current page drains', { timeout: 30_000 }, async () => {
  const { t, admin } = await queue(26);
  const first = await admin.query(api.publicationAdmin.listing, { paginationOpts: { cursor: null, numItems: 25 } });
  const second = await admin.query(api.publicationAdmin.listing, {
    paginationOpts: { cursor: first.continueCursor, numItems: 25 },
  });
  expect(second.page).toHaveLength(1);
  await t.run((ctx) => ctx.db.delete(second.page[0]!.id));
  const drained = await admin.query(api.publicationAdmin.listing, {
    paginationOpts: { cursor: first.continueCursor, numItems: 25 },
  });
  expect(drained.page).toHaveLength(0);
  expect(drained.isDone).toBe(true);
  const previous = await admin.query(api.publicationAdmin.listing, { paginationOpts: { cursor: null, numItems: 25 } });
  expect(previous.page).toHaveLength(25);
  expect(previous.counts.pending).toEqual({ value: 25, limited: false });
});

test('large job payloads stay within the query read limit and report bounded counts', { timeout: 30_000 }, async () => {
  const { admin } = await queue(30, true);
  const page = await admin.query(api.publicationAdmin.listing, { paginationOpts: { cursor: null, numItems: 25 } });
  expect(page.page.length).toBeGreaterThan(0);
  expect(page.isDone).toBe(false);
  expect(page.counts.pending.limited).toBe(true);
  expect(page.counts.pending.value).toBeGreaterThan(0);
  const next = await admin.query(api.publicationAdmin.listing, {
    paginationOpts: { cursor: page.continueCursor, numItems: 25 },
  });
  expect(next.page.length).toBeGreaterThan(0);
  expect(next.page[0]!.id).not.toBe(page.page[0]!.id);
});

test('already loaded clients retain the numbered page contract during rollout', { timeout: 30_000 }, async () => {
  const { admin } = await queue(3);
  const legacy = await admin.query(api.publicationAdmin.page, { page: 2, pageSize: 25 });
  expect(legacy).toMatchObject({ total: 3, page: 1, pageSize: 25, counts: { pending: 3, inProgress: 0, error: 0 } });
  expect(legacy.jobs).toHaveLength(3);
});
