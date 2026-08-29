/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function migrationAccessTest() {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  const identities = await t.run(async (ctx) => {
    const memberId = await ctx.db.insert('users', { name: 'Member' });
    const adminId = await ctx.db.insert('users', { name: 'Admin', isAdmin: true });
    return { memberId, adminId };
  });
  return {
    t,
    member: t.withIdentity({ subject: identities.memberId }),
    admin: t.withIdentity({ subject: identities.adminId }),
  };
}

describe('migration control access', () => {
  test('the dashboard discloses migration data to admins', async () => {
    const { t, member, admin } = await migrationAccessTest();

    await expect(t.query(api.migrations.adminDashboard, { ids: [] })).resolves.toEqual({
      access: 'unauthenticated',
    });
    await expect(member.query(api.migrations.adminDashboard, { ids: [] })).resolves.toEqual({
      access: 'not_authorized',
    });
    await expect(admin.query(api.migrations.adminDashboard, { ids: [] })).resolves.toMatchObject({
      access: 'admin',
      snapshots: [],
      statuses: [],
    });
  });

  test('the browser sync requires an admin while deployment uses its internal twin', async () => {
    const { t, member, admin } = await migrationAccessTest();

    await expect(t.mutation(api.migrations.syncMigrationRuns, { ids: [] })).rejects.toThrow('Not authenticated');
    await expect(member.mutation(api.migrations.syncMigrationRuns, { ids: [] })).rejects.toThrow('Not authorized');
    await expect(admin.mutation(api.migrations.syncMigrationRuns, { ids: [] })).resolves.toEqual({ synced: 0 });
    await expect(t.mutation(internal.migrations.syncMigrationRunsForDeploy, { ids: [] })).resolves.toEqual({
      synced: 0,
    });
  });
});
