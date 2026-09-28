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

const legacyLinks = { name: 'TTS', items: [{ url: 'https://example.com/board.png' }] };

describe('faction Extras references migration', () => {
  test('drops retired TTS link lists, keeps references, and records both migrations as complete', async () => {
    const t = migrationTest();
    const [legacyOnly, mixed, untouched] = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Faction owner' });
      const row = (slug: string, data: Record<string, unknown>) =>
        ctx.db.insert('factions', {
          owner_id: ownerId,
          data: { name: slug, ...data },
          slug,
          created_at: '2026-09-28T00:00:00.000Z',
          updated_at: '2026-09-28T00:00:00.000Z',
          is_deleted: false,
          group_id: null,
        });
      return await Promise.all([
        row('legacy-only', { extras: [legacyLinks] }),
        row('mixed', { extras: [legacyLinks, { type: 'deck', slug: 'omens' }] }),
        row('untouched', {}),
      ]);
    });

    await t.mutation(internal.migrations.faction_extras_references_v1, {});
    await t.mutation(internal.migrations.faction_extras_references_verify_v1, {});

    const data = await t.run(async (ctx) =>
      Promise.all([legacyOnly, mixed, untouched].map(async (id) => (await ctx.db.get('factions', id))?.data))
    );
    expect(data).toEqual([
      { name: 'legacy-only' },
      { name: 'mixed', extras: [{ type: 'deck', slug: 'omens' }] },
      { name: 'untouched' },
    ]);
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_extras_references_v1', 'faction_extras_references_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });
});
