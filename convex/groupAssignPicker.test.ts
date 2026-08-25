/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import schema from './schema';
import type { MutationCtx } from './types';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-10T00:00:00.000Z';

async function seedUsersAndGroups(ctx: MutationCtx) {
  const ownerId = await ctx.db.insert('users', { name: 'Owner' });
  const otherId = await ctx.db.insert('users', { name: 'Other owner' });

  const targetGroupId = await ctx.db.insert('groups', {
    name: 'Target Guild',
    slug: 'target-guild',
    created_at: now,
    created_by: ownerId,
    is_deleted: false,
  });
  const otherGroupId = await ctx.db.insert('groups', {
    name: 'Other Guild',
    slug: 'other-guild',
    created_at: now,
    created_by: ownerId,
    is_deleted: false,
  });
  const deletedGroupId = await ctx.db.insert('groups', {
    name: 'Deleted Guild',
    slug: 'deleted-guild',
    created_at: now,
    created_by: ownerId,
    is_deleted: true,
  });

  return { ownerId, otherId, targetGroupId, otherGroupId, deletedGroupId };
}

async function seedFactions(ctx: MutationCtx, seeded: Awaited<ReturnType<typeof seedUsersAndGroups>>) {
  const { ownerId, otherId, otherGroupId, deletedGroupId } = seeded;

  const unassignedFactionId = await ctx.db.insert('factions', {
    owner_id: ownerId,
    data: { ...assetPublishingFaction, name: 'Unassigned Faction' },
    slug: 'unassigned-faction',
    created_at: now,
    updated_at: now,
    is_deleted: false,
    group_id: null,
  });
  const elsewhereFactionId = await ctx.db.insert('factions', {
    owner_id: ownerId,
    data: { ...assetPublishingFaction, name: 'Elsewhere Faction' },
    slug: 'elsewhere-faction',
    created_at: now,
    updated_at: now,
    is_deleted: false,
    group_id: otherGroupId,
  });
  await ctx.db.insert('factions', {
    owner_id: ownerId,
    data: { ...assetPublishingFaction, name: 'Deleted Faction' },
    slug: 'deleted-faction',
    created_at: now,
    updated_at: now,
    is_deleted: true,
    group_id: null,
  });
  await ctx.db.insert('factions', {
    owner_id: otherId,
    data: { ...assetPublishingFaction, name: 'Someone Elses Faction' },
    slug: 'someone-elses-faction',
    created_at: now,
    updated_at: now,
    is_deleted: false,
    group_id: null,
  });
  const danglingGroupFactionId = await ctx.db.insert('factions', {
    owner_id: ownerId,
    data: { ...assetPublishingFaction, name: 'Dangling Group Faction' },
    slug: 'dangling-group-faction',
    created_at: now,
    updated_at: now,
    is_deleted: false,
    group_id: deletedGroupId,
  });

  return { unassignedFactionId, elsewhereFactionId, danglingGroupFactionId };
}

async function seedRulesets(ctx: MutationCtx, seeded: Awaited<ReturnType<typeof seedUsersAndGroups>>) {
  const { ownerId, otherId } = seeded;

  const unassignedRulesetId = await ctx.db.insert('rulesets', {
    name: 'UnassignedRuleset',
    about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
    slug: 'unassigned-ruleset',
    created_at: now,
    updated_at: now,
    owner_id: ownerId,
    group_id: null,
    is_deleted: false,
    image_cover: null,
  });
  await ctx.db.insert('rulesets', {
    name: 'DeletedRuleset',
    about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
    slug: 'deleted-ruleset',
    created_at: now,
    updated_at: now,
    owner_id: ownerId,
    group_id: null,
    is_deleted: true,
    image_cover: null,
  });
  await ctx.db.insert('rulesets', {
    name: 'SomeoneElsesRuleset',
    about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
    slug: 'someone-elses-ruleset',
    created_at: now,
    updated_at: now,
    owner_id: otherId,
    group_id: null,
    is_deleted: false,
    image_cover: null,
  });

  return { unassignedRulesetId };
}

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const seeded = await seedUsersAndGroups(ctx);
    const factionIds = await seedFactions(ctx, seeded);
    const rulesetIds = await seedRulesets(ctx, seeded);

    return {
      ownerId: seeded.ownerId,
      targetGroupId: seeded.targetGroupId,
      otherGroupId: seeded.otherGroupId,
      ...factionIds,
      ...rulesetIds,
    };
  });

  return { t, owner: t.withIdentity({ subject: ids.ownerId }), ids };
}

describe('factions.listOwnedForGroupAssign', () => {
  test("lists only the viewer's own, live factions with the current group name resolved", async () => {
    const { owner, ids } = await fixture();
    const rows = await owner.query(api.factions.listOwnedForGroupAssign, {});

    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    expect(bySlug.size).toBe(3);
    expect(bySlug.get('unassigned-faction')).toMatchObject({
      groupId: null,
      groupName: null,
    });
    expect(bySlug.get('elsewhere-faction')).toMatchObject({
      groupId: ids.otherGroupId,
      groupName: 'Other Guild',
    });
    expect(bySlug.has('deleted-faction')).toBe(false);
    expect(bySlug.has('someone-elses-faction')).toBe(false);
  });

  test('projects a group_id pointing at a soft-deleted group to unassigned', async () => {
    const { owner } = await fixture();
    const rows = await owner.query(api.factions.listOwnedForGroupAssign, {});
    const danglingRow = rows.find((row) => row.slug === 'dangling-group-faction');
    expect(danglingRow).toMatchObject({ groupId: null, groupName: null });
  });

  test('requires authentication', async () => {
    const { t } = await fixture();
    await expect(t.query(api.factions.listOwnedForGroupAssign, {})).rejects.toThrow(/Not authenticated/);
  });
});

describe('rulesets.listOwnedForGroupAssign', () => {
  test("lists only the viewer's own, live rulesets", async () => {
    const { owner } = await fixture();
    const rows = await owner.query(api.rulesets.listOwnedForGroupAssign, {});

    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    expect(bySlug.size).toBe(1);
    expect(bySlug.get('unassigned-ruleset')).toMatchObject({
      groupId: null,
      groupName: null,
    });
    expect(bySlug.has('deleted-ruleset')).toBe(false);
    expect(bySlug.has('someone-elses-ruleset')).toBe(false);
  });

  test('requires authentication', async () => {
    const { t } = await fixture();
    await expect(t.query(api.rulesets.listOwnedForGroupAssign, {})).rejects.toThrow(/Not authenticated/);
  });
});
