/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import type { TestConvex } from 'convex-test';

import { rulebookNameKey } from '../src/shared/rulebooks/metadata';
import type { Id } from './_generated/dataModel';
import { applicationTriggers } from './lib/applicationTriggers';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const AT = '2026-08-30T00:00:00.000Z';

type RulebookTest = TestConvex<typeof schema>;
type RulebookFixtureIds = {
  ownerId: Id<'users'>;
  rulesetId: Id<'rulesets'>;
};

function createRulebookSeeder(t: RulebookTest, ids: RulebookFixtureIds) {
  return async (
    rows: ReadonlyArray<{
      name: string;
      slug: string;
      isDeleted?: boolean;
    }>
  ) =>
    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const rulebookIds = [];
      for (const [sortOrder, row] of rows.entries()) {
        const isDeleted = row.isDeleted ?? false;
        rulebookIds.push(
          await ctx.db.insert('rulebooks', {
            ruleset_id: ids.rulesetId,
            name: row.name,
            name_key: rulebookNameKey(row.name),
            slug: row.slug,
            sort_order: sortOrder,
            current_edition_number: 1,
            created_by: ids.ownerId,
            created_at: AT,
            updated_at: AT,
            is_deleted: isDeleted,
            deleted_at: isDeleted ? AT : null,
          })
        );
      }
      return rulebookIds;
    });
}

export async function rulebookFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');

  const ids = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const ownerId = await ctx.db.insert('users', { name: 'Ruleset owner' });
    const memberId = await ctx.db.insert('users', { name: 'Group member' });
    const outsiderId = await ctx.db.insert('users', { name: 'Outsider' });
    const groupId = await ctx.db.insert('groups', {
      name: 'Rulebook authors',
      slug: 'rulebook-authors',
      created_at: AT,
      created_by: ownerId,
      is_deleted: false,
    });
    for (const userId of [ownerId, memberId]) {
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: userId,
        status: 'active',
        requested_at: AT,
        approved_at: AT,
        approved_by: ownerId,
      });
    }
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Rulebook test rules',
      about: 'A ruleset that proves Rulebook persistence under collaborative permissions.',
      slug: 'rulebook-test-rules',
      owner_id: ownerId,
      group_id: groupId,
      image_cover: null,
      created_at: AT,
      updated_at: AT,
      is_deleted: false,
    });
    const otherRulesetId = await ctx.db.insert('rulesets', {
      name: 'Other Rulebook test rules',
      about: 'A second ruleset that proves clone sources cannot cross the ownership boundary.',
      slug: 'other-rulebook-test-rules',
      owner_id: ownerId,
      group_id: groupId,
      image_cover: null,
      created_at: AT,
      updated_at: AT,
      is_deleted: false,
    });
    return { ownerId, memberId, outsiderId, rulesetId, otherRulesetId };
  });

  return {
    t,
    ids,
    seedRulebooks: createRulebookSeeder(t, ids),
    owner: t.withIdentity({ subject: ids.ownerId }),
    member: t.withIdentity({ subject: ids.memberId }),
    outsider: t.withIdentity({ subject: ids.outsiderId }),
  };
}
