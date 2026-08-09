/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-09T00:00:00.000Z';

async function migrationFixture() {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Migration owner' });
    const legacyGroupId = await ctx.db.insert('groups', {
      name: 'LegacyGroup',
      slug: 'legacygroup',
      created_at: now,
      created_by: ownerId,
    });
    const deletedGroupId = await ctx.db.insert('groups', {
      name: 'DeletedGroup',
      slug: 'deletedgroup',
      created_at: now,
      created_by: ownerId,
      is_deleted: true,
    });
    return { ownerId, legacyGroupId, deletedGroupId };
  });
  return { t, ids };
}

describe('Group soft-delete backfill and audit', () => {
  test('backfill marks pre-lifecycle Groups active and never resurrects deleted ones', async () => {
    const { t, ids } = await migrationFixture();

    await t.mutation(internal.migrations.groups_soft_delete_backfill_v1, {
      cursor: null,
      dryRun: false,
      oneBatchOnly: true,
    });
    await t.mutation(internal.migrations.groups_soft_delete_verify_v1, {
      cursor: null,
      dryRun: false,
      oneBatchOnly: true,
    });

    await t.run(async (ctx) => {
      const legacy = await ctx.db.get('groups', ids.legacyGroupId);
      const deleted = await ctx.db.get('groups', ids.deletedGroupId);
      expect(legacy?.is_deleted).toBe(false);
      expect(deleted?.is_deleted).toBe(true);
    });
  });

  test('verify fails while any Group is missing its lifecycle state', async () => {
    const { t } = await migrationFixture();

    await expect(
      t.mutation(internal.migrations.groups_soft_delete_verify_v1, {
        cursor: null,
        dryRun: false,
        oneBatchOnly: true,
      })
    ).rejects.toThrow('missing its lifecycle state');
  });

  test('audit counts dangling group references without repairing them', async () => {
    const { t, ids } = await migrationFixture();
    const vanishedRefs = await t.run(async (ctx) => {
      const vanishedGroupId = await ctx.db.insert('groups', {
        name: 'VanishedGroup',
        slug: 'vanishedgroup',
        created_at: now,
        created_by: ids.ownerId,
      });
      const factionId = await ctx.db.insert('factions', {
        owner_id: ids.ownerId,
        data: { name: 'Orphaned Faction' },
        slug: 'orphaned-faction',
        created_at: now,
        updated_at: now,
        is_deleted: false,
        group_id: vanishedGroupId,
      });
      const membershipId = await ctx.db.insert('group_members', {
        group_id: vanishedGroupId,
        user_id: ids.ownerId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ids.ownerId,
      });
      const rulesetId = await ctx.db.insert('rulesets', {
        name: 'GroupedRuleset',
        slug: 'groupedruleset',
        created_at: now,
        updated_at: now,
        owner_id: ids.ownerId,
        group_id: ids.legacyGroupId,
        is_deleted: false,
        image_cover: null,
      });
      await ctx.db.delete(vanishedGroupId);
      return { vanishedGroupId, factionId, membershipId, rulesetId };
    });

    const audit = await t.query(internal.migrations.groupsLifecycleAudit, {});

    expect(audit.groups).toMatchObject({ total: 2, missingLifecycleFlag: 1, deleted: 1 });
    expect(audit.factions).toMatchObject({ dangling: 1, danglingIds: [vanishedRefs.factionId] });
    expect(audit.memberships).toMatchObject({
      dangling: 1,
      danglingIds: [vanishedRefs.membershipId],
    });
    expect(audit.rulesets).toMatchObject({ dangling: 0, withGroupReference: 1 });

    await t.run(async (ctx) => {
      const faction = await ctx.db.get('factions', vanishedRefs.factionId);
      const membership = await ctx.db.get('group_members', vanishedRefs.membershipId);
      expect(faction?.group_id).toBe(vanishedRefs.vanishedGroupId as Id<'groups'>);
      expect(membership?.group_id).toBe(vanishedRefs.vanishedGroupId as Id<'groups'>);
    });
  });
});
