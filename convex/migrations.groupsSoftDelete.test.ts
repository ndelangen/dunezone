/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-09T00:00:00.000Z';

describe('Group lifecycle audit', () => {
  test('audit counts dangling group references without repairing them', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Migration owner' });
      const deletedGroupId = await ctx.db.insert('groups', {
        name: 'DeletedGroup',
        slug: 'deletedgroup',
        created_at: now,
        created_by: ownerId,
        is_deleted: true,
      });
      const vanishedGroupId = await ctx.db.insert('groups', {
        name: 'VanishedGroup',
        slug: 'vanishedgroup',
        created_at: now,
        created_by: ownerId,
        is_deleted: false,
      });
      const factionId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { name: 'Orphaned Faction' },
        slug: 'orphaned-faction',
        created_at: now,
        updated_at: now,
        is_deleted: false,
        group_id: vanishedGroupId,
      });
      const membershipId = await ctx.db.insert('group_members', {
        group_id: vanishedGroupId,
        user_id: ownerId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ownerId,
      });
      const rulesetId = await ctx.db.insert('rulesets', {
        name: 'GroupedRuleset',
        slug: 'groupedruleset',
        created_at: now,
        updated_at: now,
        owner_id: ownerId,
        group_id: deletedGroupId,
        is_deleted: false,
        image_cover: null,
      });
      await ctx.db.delete(vanishedGroupId);
      return { vanishedGroupId, factionId, membershipId, rulesetId };
    });

    const audit = await t.query(internal.migrations.groupsLifecycleAudit, {});

    expect(audit.groups).toMatchObject({ total: 1, deleted: 1 });
    expect(audit.factions).toMatchObject({ dangling: 1, danglingIds: [ids.factionId] });
    expect(audit.memberships).toMatchObject({ dangling: 1, danglingIds: [ids.membershipId] });
    expect(audit.rulesets).toMatchObject({ dangling: 0, withGroupReference: 1 });

    await t.run(async (ctx) => {
      const faction = await ctx.db.get('factions', ids.factionId);
      const membership = await ctx.db.get('group_members', ids.membershipId);
      expect(faction?.group_id).toBe(ids.vanishedGroupId);
      expect(membership?.group_id).toBe(ids.vanishedGroupId);
    });
  });
});
