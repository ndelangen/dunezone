/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function migrationTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  migrationsTest.register(t);
  return t;
}

describe('faction marks-only formatted text migration', () => {
  test('joins legacy layout lines and records both migrations as complete', async () => {
    const t = migrationTest();
    const factionId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Faction owner' });
      return await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: {
          rules: {
            startText: 'Start with 7 spice.\nKeep a separate cache.\nDo not add it to your hand.',
            revivalText: '1 *free* revival.',
          },
        },
        slug: 'inline-faction',
        created_at: '2026-08-25T00:00:00.000Z',
        updated_at: '2026-08-25T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      });
    });

    await t.mutation(internal.migrations.faction_inline_formatted_text_v1, {});
    await t.mutation(internal.migrations.faction_inline_formatted_text_verify_v1, {});

    const faction = await t.run((ctx) => ctx.db.get('factions', factionId));
    expect(faction?.data).toMatchObject({
      rules: {
        startText: 'Start with 7 spice. Keep a separate cache. Do not add it to your hand.',
        revivalText: '1 *free* revival.',
      },
    });
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_inline_formatted_text_v1', 'faction_inline_formatted_text_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });
});
