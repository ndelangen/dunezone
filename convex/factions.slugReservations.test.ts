/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function authenticatedTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(
    async (ctx) => await ctx.db.insert('users', { name: 'Faction slug reservation test user' })
  );
  return { t, asUser: t.withIdentity({ subject: userId }) };
}

async function createFaction(
  asUser: Awaited<ReturnType<typeof authenticatedTest>>['asUser'],
  name: string
) {
  return await asUser.mutation(api.factions.create, {
    data: { ...assetPublishingFaction, name },
    group_id: null,
  });
}

describe('faction slug reservations', () => {
  test('create rejects a blank faction name at the authoritative boundary', async () => {
    const { asUser } = await authenticatedTest();

    await expect(createFaction(asUser, '   ')).rejects.toThrow(
      'Invalid faction data at name: Faction name is required because it determines the faction URL'
    );
  });

  test('a soft-deleted faction keeps its slug reserved for create', async () => {
    const { asUser } = await authenticatedTest();
    const faction = await createFaction(asUser, 'Reserved Faction');
    await asUser.mutation(api.factions.softDelete, { id: faction._id });

    await expect(createFaction(asUser, 'Reserved Faction')).rejects.toThrow(
      'Faction slug reserved-faction is reserved'
    );
  });

  test('a soft-deleted faction keeps its slug reserved for rename', async () => {
    const { asUser } = await authenticatedTest();
    const reserved = await createFaction(asUser, 'Reserved Faction');
    await asUser.mutation(api.factions.softDelete, { id: reserved._id });
    const active = await createFaction(asUser, 'Active Faction');

    await expect(
      asUser.mutation(api.factions.update, {
        id: active._id,
        data: { ...assetPublishingFaction, name: 'Reserved Faction' },
      })
    ).rejects.toThrow('Faction slug reserved-faction is reserved');
  });

  test('the repair keeps the active public slug and archives the deleted duplicate', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    const { activeId, deletedId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Faction slug migration owner' });
      await ctx.db.insert('profiles', {
        user_id: ownerId,
        username: 'Faction slug migration owner',
        avatar_url: null,
        slug: 'faction-slug-migration-owner',
        created_at: '2026-07-22T06:00:00.000Z',
        updated_at: '2026-07-22T06:00:00.000Z',
      });
      const deletedId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { ...assetPublishingFaction, name: 'Migrated Faction' },
        slug: 'migrated-faction',
        created_at: '2026-07-22T06:00:00.000Z',
        updated_at: '2026-07-22T06:01:00.000Z',
        is_deleted: true,
        group_id: null,
      });
      const activeId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { ...assetPublishingFaction, name: 'Migrated Faction' },
        slug: 'migrated-faction',
        created_at: '2026-07-22T06:02:00.000Z',
        updated_at: '2026-07-22T06:02:00.000Z',
        is_deleted: false,
        group_id: null,
      });
      return { activeId, deletedId };
    });

    await t.mutation(internal.migrations.faction_slug_reservations_v1, {});
    await t.mutation(internal.migrations.faction_slug_reservations_verify_v1, {});

    const repaired = await t.run(async (ctx) => ({
      active: await ctx.db.get('factions', activeId),
      deleted: await ctx.db.get('factions', deletedId),
    }));
    expect(repaired.active?.slug).toBe('migrated-faction');
    expect(repaired.deleted?.slug).toBe(`migrated-faction-archived-${deletedId}`);
    await expect(
      t.query(api.factions.getBySlug, { slug: 'migrated-faction' })
    ).resolves.toMatchObject({ faction: { _id: activeId } });
  });
});
