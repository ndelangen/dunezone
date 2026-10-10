/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('expires old accepted and pending credentials while preserving unexpired progress', async () => {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  const rows = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {});
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
    const rows = [];
    for (const [state, delta] of [
      ['accepted', -100],
      ['pending', -100],
      ['accepted', 600_000],
      ['expired', -100],
    ] as const) {
      rows.push(
        await ctx.db.insert('account_connections', {
          digest: `${state}-${delta}`,
          user_id: userId,
          session_id: sessionId,
          provider: 'google',
          state,
          expires_at: Date.now() + delta,
        })
      );
    }
    return rows;
  });
  await t.mutation(internal.migrations.account_connections_expire_v1, {});
  await t.mutation(internal.migrations.account_connections_expire_v1, { reset: true });
  expect(await t.run(async (ctx) => Promise.all(rows.map(async (id) => (await ctx.db.get(id))?.state)))).toEqual([
    'expired',
    'expired',
    'accepted',
    'expired',
  ]);
});
