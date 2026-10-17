/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';

async function migrationAccessTest() {
  const t = applicationTest();
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
  test('the dashboard discloses migration data to admins only', async () => {
    const { t, member, admin } = await migrationAccessTest();

    await expect(t.query(api.migrations.adminDashboard, { ids: [] })).rejects.toThrow('Not authenticated');
    await expect(member.query(api.migrations.adminDashboard, { ids: [] })).rejects.toThrow('Not authorized');
    await expect(admin.query(api.migrations.adminDashboard, { ids: [] })).resolves.toMatchObject({
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
