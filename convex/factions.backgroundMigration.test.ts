/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { FactionInputSchema, LegacyFactionInputSchema } from '../src/game/schema/faction';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function legacyFactionData() {
  return {
    ...structuredClone(assetPublishingFaction),
    background: {
      image: assetPublishingFaction.background.image,
      colors: assetPublishingFaction.background.colors,
      strength: 0.36,
      opacity: 0.88,
    },
  };
}

async function insertFaction(
  t: ReturnType<typeof convexTest>,
  data: unknown,
  name: string,
  isDeleted = false
) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: `${name} owner` });
    return await ctx.db.insert('factions', {
      owner_id: ownerId,
      data,
      slug: name,
      created_at: '2026-07-23T00:00:00.000Z',
      updated_at: '2026-07-23T00:00:00.000Z',
      is_deleted: isDeleted,
      group_id: null,
    });
  });
}

describe('faction background migration', () => {
  test('rewrites legacy active and deleted rows and verifies the canonical shape', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    const legacyActiveId = await insertFaction(t, legacyFactionData(), 'legacy-active');
    const legacyDeletedId = await insertFaction(t, legacyFactionData(), 'legacy-deleted', true);
    const legacyBlankNameId = await insertFaction(
      t,
      { ...legacyFactionData(), name: '' },
      'legacy-blank-name'
    );
    const canonicalId = await insertFaction(
      t,
      structuredClone(assetPublishingFaction),
      'canonical'
    );

    await expect(t.query(api.migrations.auditFactionBackgrounds, {})).resolves.toMatchObject({
      total: 4,
      canonical: 1,
      legacy: 3,
      unexpected: 0,
    });

    await t.mutation(internal.migrations.faction_background_v1, {});
    await t.mutation(internal.migrations.faction_background_verify_v1, {});

    const rows = await t.run(async (ctx) => ({
      legacyActive: await ctx.db.get('factions', legacyActiveId),
      legacyDeleted: await ctx.db.get('factions', legacyDeletedId),
      legacyBlankName: await ctx.db.get('factions', legacyBlankNameId),
      canonical: await ctx.db.get('factions', canonicalId),
    }));
    for (const row of Object.values(rows)) {
      expect(row?.data.background).toEqual({
        image: assetPublishingFaction.background.image,
        colors: assetPublishingFaction.background.colors,
        invert: true,
        definition: expect.any(Number),
        influence: expect.any(Number),
      });
      expect(row?.data.background).not.toHaveProperty('strength');
      expect(row?.data.background).not.toHaveProperty('opacity');
    }
    expect(rows.legacyActive?.data.background).toMatchObject({
      definition: 0.36,
      influence: 0.88,
    });
    expect(rows.legacyBlankName?.data.name).toBe('');
    await expect(t.query(api.migrations.auditFactionBackgrounds, {})).resolves.toMatchObject({
      total: 4,
      canonical: 4,
      legacy: 0,
      unexpected: 0,
    });

    const publicRows = await t.query(api.factions.list, {});
    expect(publicRows).toHaveLength(3);
    for (const row of publicRows) {
      expect(LegacyFactionInputSchema.safeParse(row.data).success).toBe(true);
      expect(FactionInputSchema.safeParse(row.data).success).toBe(false);
    }
  });

  test('fails rather than silently rewriting an unexpected faction shape', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    await insertFaction(
      t,
      {
        ...legacyFactionData(),
        background: {
          image: '/image/texture/021.jpg',
          colors: ['#112233', '#445566'],
          strength: 4,
          opacity: 0.5,
        },
      },
      'unexpected'
    );

    await expect(t.mutation(internal.migrations.faction_background_v1, {})).resolves.toMatchObject({
      Status: expect.stringContaining('Migration failed'),
      processed: 0,
    });
    await expect(t.query(api.migrations.auditFactionBackgrounds, {})).resolves.toMatchObject({
      total: 1,
      canonical: 0,
      legacy: 0,
      unexpected: 1,
    });
  });
});
