/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const VALID_ABOUT = 'A house ruleset that rebalances spice income and shortens the endgame considerably.';

function rulesetTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

async function rulesetOwner() {
  const t = rulesetTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Ruleset owner' }));
  return { t, owner: t.withIdentity({ subject: ownerId }) };
}

describe('Ruleset naming', () => {
  test('a name with spaces is accepted and its slug is derived from it', async () => {
    const { owner } = await rulesetOwner();
    const ruleset = await owner.mutation(api.rulesets.create, {
      name: 'Test Ruleset',
      about: VALID_ABOUT,
      group_id: null,
      image_cover: null,
    });
    expect(ruleset).toMatchObject({ name: 'Test Ruleset', slug: 'test-ruleset' });

    const again = await owner.mutation(api.rulesets.create, {
      name: 'Test  Ruleset!',
      about: VALID_ABOUT,
      group_id: null,
      image_cover: null,
    });
    expect(again.slug).toBe('test-ruleset-2');
  });

  test('a blank name is refused in product language', async () => {
    const { owner } = await rulesetOwner();
    await expect(
      owner.mutation(api.rulesets.create, { name: '   ', about: VALID_ABOUT, group_id: null, image_cover: null })
    ).rejects.toThrow(/Ruleset name is required because it determines the ruleset URL/);
  });
});
