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
const required = ['rulesets_about_v1', 'rulesets_about_verify_v1'];

function rulesetMigrationTest() {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  aggregateTest.register(t, 'statistics');
  return t;
}

async function insertRuleset(
  t: ReturnType<typeof convexTest>,
  fields: { name: string; description: string; about?: string }
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

describe('the Ruleset About widen and verifier', () => {
  test('copy legacy prose exactly, including the empty production shape', async () => {
    const t = rulesetMigrationTest();
    const proseId = await insertRuleset(t, { name: 'Prose', description: prose });
    const emptyId = await insertRuleset(t, { name: 'Empty', description: '' });
    const currentId = await insertRuleset(t, { name: 'Current', description: prose, about: prose });

    await t.mutation(internal.migrations.rulesets_about_v1, {});
    await t.mutation(internal.migrations.rulesets_about_verify_v1, {});

    await expect(t.query(api.migrations.assertReadyForNarrow, { required })).resolves.toMatchObject({ ok: true });
    await t.run(async (ctx) => {
      expect(await ctx.db.get('rulesets', proseId)).toMatchObject({ about: prose, description: prose });
      expect(await ctx.db.get('rulesets', emptyId)).toMatchObject({ about: '', description: '' });
      expect(await ctx.db.get('rulesets', currentId)).toMatchObject({ about: prose, description: prose });
    });
  });

  test('block retirement when the two stored values disagree', async () => {
    const t = rulesetMigrationTest();
    await insertRuleset(t, { name: 'Drifted', description: prose, about: 'Different stored prose.' });

    await t.mutation(internal.migrations.rulesets_about_v1, {});
    await t.mutation(internal.migrations.rulesets_about_verify_v1, {});

    await expect(t.query(api.migrations.assertReadyForNarrow, { required })).rejects.toThrow(
      /required migrations are incomplete/
    );
  });
});
