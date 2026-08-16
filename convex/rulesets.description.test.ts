/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const VALID_DESCRIPTION = 'A house ruleset that rebalances spice income and shortens the endgame considerably.';

function rulesetTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

async function ownedRuleset() {
  const t = rulesetTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Ruleset owner' }));
  const owner = t.withIdentity({ subject: ownerId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'DescriptionRuleset',
    description: VALID_DESCRIPTION,
    group_id: null,
    image_cover: null,
  });
  return { t, owner, ruleset };
}

describe('ruleset descriptions', () => {
  test('a description below the floor is rejected', async () => {
    const { owner, ruleset } = await ownedRuleset();

    await expect(
      owner.mutation(api.rulesets.update, {
        id: ruleset._id,
        name: 'DescriptionRuleset',
        description: 'Too short.',
      })
    ).rejects.toThrow(/at least 50 characters/);
  });

  /*
   * The tolerated case the narrowed schema still has to carry: rows that predate the field hold the empty string the
   * backfill gave them, and must stay readable even though nothing may write one.
   * No mutation can produce this state any more, so it is set up directly.
   */
  test('a row left holding the backfilled empty description is still readable', async () => {
    const t = rulesetTest();
    const rulesetId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Ruleset owner' });
      return await ctx.db.insert('rulesets', {
        name: 'PredatesTheField',
        description: '',
        slug: 'predates-the-field',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
    });

    await expect(t.query(api.rulesets.get, { id: rulesetId })).resolves.toMatchObject({
      name: 'PredatesTheField',
      description: '',
    });
  });
});
