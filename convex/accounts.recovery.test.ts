// @vitest-environment edge-runtime
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { account, setup, stubAuthEnvironment, restoreAuthEnvironment } from './authAccount.test.fixture';

beforeEach(stubAuthEnvironment);
afterEach(restoreAuthEnvironment);

/* The fixture runs an account lifecycle and inserts forty later operations, including on busy runners. */
test(
  'failed merges stay reachable and retryable after later operations fill the recent list',
  { timeout: 30_000 },
  async () => {
    const t = setup();
    const source = await account(t, 'source', 'discord');
    const target = await account(t, 'target', 'google', true);
    const admin = t.withIdentity({ subject: `${target.userId}|${target.sessionId}` });
    const operationId = await admin.mutation(api.accounts.merge, {
      sourceUserId: source.userId,
      targetUserId: target.userId,
    });
    await t.mutation(internal.accounts.failMerge, { operationId, error: 'Interrupted merge' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      const original = (await ctx.db.get(operationId))!;
      const { _id, _creationTime, ...fields } = original;
      for (let index = 0; index < 40; index += 1) {
        vi.advanceTimersByTime(1);
        await ctx.db.insert('account_merge_operations', {
          ...fields,
          state: index < 20 ? 'failed' : 'completed',
          error: index < 20 ? 'Another interrupted merge' : null,
        });
      }
    });
    const args = { paginationOpts: { cursor: null, numItems: 40 }, selectedUserIds: [] };
    const first = await admin.query(api.accounts.adminPage, args);
    expect(first.operations.every((operation) => operation.state === 'completed')).toBe(true);
    expect(first.failedOperations.page).toHaveLength(20);
    expect(first.failedOperations.isDone).toBe(false);
    const second = await admin.query(api.accounts.adminPage, {
      ...args,
      failedPaginationOpts: { cursor: first.failedOperations.continueCursor, numItems: 20 },
    });
    expect(second.failedOperations.page.map((operation) => operation._id)).toEqual([operationId]);
    expect(second.failedOperations.isDone).toBe(true);
    await admin.mutation(api.accounts.resumeMerge, { operationId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(operationId))).toMatchObject({ state: 'completed' });
    const recovered = await admin.query(api.accounts.adminPage, {
      ...args,
      failedPaginationOpts: { cursor: first.failedOperations.continueCursor, numItems: 20 },
    });
    expect(recovered.failedOperations.page).toEqual([]);
  }
);
