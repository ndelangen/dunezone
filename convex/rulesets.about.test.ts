/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const VALID_ABOUT = 'A house ruleset that rebalances spice income and shortens the endgame considerably.';
const UPDATED_ABOUT = 'A revised house ruleset that changes spice income and makes the final turns much quicker.';

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

describe('Ruleset About', () => {
  test('creates and updates store only the canonical field', async () => {
    const { owner } = await rulesetOwner();
    const ruleset = await owner.mutation(api.rulesets.create, {
      name: 'AboutRuleset',
      about: VALID_ABOUT,
      group_id: null,
      image_cover: null,
    });

    expect(ruleset).toMatchObject({ about: VALID_ABOUT });
    expect(ruleset).not.toHaveProperty('description');

    await expect(
      owner.mutation(api.rulesets.update, {
        id: ruleset._id,
        name: 'AboutRuleset',
        about: UPDATED_ABOUT,
      })
    ).resolves.toMatchObject({ about: UPDATED_ABOUT });
  });

  test('an About below the floor is rejected in product language', async () => {
    const { owner } = await rulesetOwner();

    await expect(
      owner.mutation(api.rulesets.create, {
        name: 'ShortRuleset',
        about: 'Too short.',
        group_id: null,
        image_cover: null,
      })
    ).rejects.toThrow(/Ruleset About must be at least 50 characters/);
  });

  test('active reads omit a legacy field that the retirement migration has not reached yet', async () => {
    const t = rulesetTest();
    const rulesetId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Ruleset owner' });
      return await ctx.db.insert('rulesets', {
        name: 'AwaitingRetirement',
        about: '',
        description: '',
        slug: 'awaiting-retirement',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
    });

    const result = await t.query(api.rulesets.get, { id: rulesetId });
    expect(result).toMatchObject({ name: 'AwaitingRetirement', about: '' });
    expect(result).not.toHaveProperty('description');
  });
});
