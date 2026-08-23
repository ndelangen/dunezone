/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-23T00:00:00.000Z';
const prose = 'A house ruleset that rebalances spice income and shortens the endgame considerably.';
const completedAboutIds = ['rulesets_about_v1', 'rulesets_about_verify_v1'];
const retirementIds = ['rulesets_description_retire_v1', 'rulesets_description_retire_verify_v1'];

function rulesetMigrationTest() {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  aggregateTest.register(t, 'statistics');
  return t;
}

async function insertRuleset(
  t: ReturnType<typeof convexTest>,
  fields: { name: string; about: string; description?: string }
) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: `${fields.name} owner` });
    return await ctx.db.insert('rulesets', {
      ...fields,
      slug: fields.name.toLowerCase(),
      created_at: now,
      updated_at: now,
      owner_id: ownerId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
  });
}

describe('the Ruleset description retirement', () => {
  test('removes legacy prose while preserving About and accepts already-retired rows', async () => {
    const t = rulesetMigrationTest();
    const proseId = await insertRuleset(t, { name: 'Prose', about: prose, description: prose });
    const emptyId = await insertRuleset(t, { name: 'Empty', about: '', description: '' });
    const retiredId = await insertRuleset(t, { name: 'Retired', about: prose });

    await t.mutation(internal.migrations.rulesets_about_v1, {});
    await t.mutation(internal.migrations.rulesets_about_verify_v1, {});
    await t.mutation(internal.migrations.rulesets_description_retire_v1, {});
    await t.mutation(internal.migrations.rulesets_description_retire_verify_v1, {});

    await expect(t.query(api.migrations.assertReadyForNarrow, { required: completedAboutIds })).resolves.toMatchObject({
      ok: true,
    });
    await expect(t.query(api.migrations.assertReadyForNarrow, { required: retirementIds })).resolves.toMatchObject({
      ok: true,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get('rulesets', proseId)).toMatchObject({ about: prose });
      expect(await ctx.db.get('rulesets', proseId)).not.toHaveProperty('description');
      expect(await ctx.db.get('rulesets', emptyId)).toMatchObject({ about: '' });
      expect(await ctx.db.get('rulesets', emptyId)).not.toHaveProperty('description');
      expect(await ctx.db.get('rulesets', retiredId)).toMatchObject({ about: prose });
      expect(await ctx.db.get('rulesets', retiredId)).not.toHaveProperty('description');
    });
  });

  test('blocks schema removal while any legacy field remains', async () => {
    const t = rulesetMigrationTest();
    await insertRuleset(t, { name: 'Pending', about: prose, description: prose });

    await t.mutation(internal.migrations.rulesets_description_retire_verify_v1, {});

    await expect(t.query(api.migrations.assertReadyForNarrow, { required: retirementIds })).rejects.toThrow(
      /required migrations are incomplete/
    );
  });
});
