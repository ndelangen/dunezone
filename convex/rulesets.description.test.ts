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

async function ownedRuleset(description?: string) {
  const t = rulesetTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Ruleset owner' }));
  const owner = t.withIdentity({ subject: ownerId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'DescriptionRuleset',
    ...(description === undefined ? {} : { description }),
    group_id: null,
    image_cover: null,
  });
  return { owner, ruleset };
}

describe('ruleset descriptions', () => {
  test('a ruleset created without one carries the backfill value', async () => {
    const { ruleset } = await ownedRuleset();

    expect(ruleset.description).toBe('');
  });

  test('an update that omits the description leaves the stored one intact', async () => {
    const { owner, ruleset } = await ownedRuleset(VALID_DESCRIPTION);

    const renamed = await owner.mutation(api.rulesets.update, {
      id: ruleset._id,
      name: 'RenamedRuleset',
    });

    expect(renamed.description).toBe(VALID_DESCRIPTION);
  });

  test('a description below the floor is rejected', async () => {
    const { owner, ruleset } = await ownedRuleset(VALID_DESCRIPTION);

    await expect(
      owner.mutation(api.rulesets.update, {
        id: ruleset._id,
        name: 'DescriptionRuleset',
        description: 'Too short.',
      })
    ).rejects.toThrow(/at least 50 characters/);
  });
});
