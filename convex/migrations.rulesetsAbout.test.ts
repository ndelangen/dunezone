/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
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

async function insertRuleset(t: ReturnType<typeof convexTest>, fields: { name: string; about: string }) {
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

describe('the Ruleset About migration identities', () => {
  test('remain complete without changing narrowed rows', async () => {
    const t = rulesetMigrationTest();
    const proseId = await insertRuleset(t, { name: 'Prose', about: prose });
    const emptyId = await insertRuleset(t, { name: 'Empty', about: '' });

    await t.mutation(internal.migrations.rulesets_about_v1, {});
    await t.mutation(internal.migrations.rulesets_about_verify_v1, {});
    await t.mutation(internal.migrations.rulesets_description_retire_v1, {});
    await t.mutation(internal.migrations.rulesets_description_retire_verify_v1, {});

    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: completedAboutIds })
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: retirementIds })).resolves.toMatchObject(
      {
        ok: true,
      }
    );
    await t.run(async (ctx) => {
      expect(await ctx.db.get('rulesets', proseId)).toMatchObject({ about: prose });
      expect(await ctx.db.get('rulesets', emptyId)).toMatchObject({ about: '' });
    });
  });
});
