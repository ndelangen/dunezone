/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-20T00:00:00.000Z';

describe('the About widen/verify pair', () => {
  test('agree on every row shape: backfilled, already keyed, and drifted alike', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);

    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Migration owner' });
      const base = { owner_id: ownerId, group_id: null, is_deleted: false, created_at: now, updated_at: now };
      return {
        /* The normal case the widen exists for: an object without the key. */
        plain: await ctx.db.insert('assets', {
          ...base,
          type: 'card-treachery',
          slug: 'plain',
          data: { name: 'Plain' },
        }),
        /* Already migrated; the widen must leave it alone. */
        keyed: await ctx.db.insert('assets', {
          ...base,
          type: 'card-treachery',
          slug: 'keyed',
          data: { name: 'Keyed', about: 'kept' },
        }),
        /* The schema-drift dead end: outside both halves of the pair, or one such row deadlocks it. */
        drifted: await ctx.db.insert('assets', { ...base, type: 'card-treachery', slug: 'drifted', data: 'garbage' }),
      };
    });

    await t.mutation(internal.migrations.assets_about_v1, {});
    await t.mutation(internal.migrations.assets_about_verify_v1, {});

    /*
     * The deploy gate is the seam under test: a verify that throws on the drifted row records a failed
     * migration, and assertReadyForNarrow then blocks every later deploy with no remediation.
     * The runner records per-row throws as state rather than rejecting the mutation,
     * so asking the gate is the only honest way to observe the deadlock.
     */
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['assets_about_v1', 'assets_about_verify_v1'] })
    ).resolves.toMatchObject({ ok: true });

    await t.run(async (ctx) => {
      const plain = await ctx.db.get('assets', ids.plain);
      const keyed = await ctx.db.get('assets', ids.keyed);
      const drifted = await ctx.db.get('assets', ids.drifted);
      expect(plain?.data).toMatchObject({ about: '' });
      expect(keyed?.data).toMatchObject({ about: 'kept' });
      expect(drifted?.data).toBe('garbage');
    });
  });
});
