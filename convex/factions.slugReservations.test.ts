/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function authenticatedTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const userId = await t.run(
    async (ctx) => await ctx.db.insert('users', { name: 'Faction slug reservation test user' })
  );
  const asUser = t.withIdentity({ subject: userId });
  await asUser.mutation(api.profiles.bootstrapCurrent, {});
  return { t, asUser };
}

async function createFaction(asUser: Awaited<ReturnType<typeof authenticatedTest>>['asUser'], name: string) {
  return await asUser.mutation(api.factions.create, {
    data: { ...assetPublishingFaction, name },
    group_id: null,
  });
}

describe('faction slug reservations', () => {
  test('creation and rename allocate usable addresses around the reserved create route', async () => {
    const { asUser } = await authenticatedTest();
    const occupied = await createFaction(asUser, 'Create 1');
    await asUser.mutation(api.factions.softDelete, { id: occupied._id });
    const created = await createFaction(asUser, 'Create');
    expect(created.slug).toBe('create-2');
    expect((await asUser.query(api.factions.pageBySlug, { slug: created.slug })).faction._id).toBe(created._id);
    const updated = await asUser.mutation(api.factions.update, {
      id: created._id,
      data: { ...created.data, name: 'CREATE' },
    });
    expect(updated.slug).toBe(created.slug);
    const renamed = await createFaction(asUser, 'Another Faction');
    expect(
      (await asUser.mutation(api.factions.update, { id: renamed._id, data: { ...renamed.data, name: 'create!' } })).slug
    ).toBe('create-3');
    expect(await asUser.query(api.factions.slugTaken, { slug: 'create' })).toBeNull();
  });

  test('names without a URL slug are refused clearly on create and rename without changing stored data', async () => {
    const { asUser } = await authenticatedTest();
    const message = 'Faction name must contain at least one letter A-Z or number 0-9 to form its URL';
    await expect(createFaction(asUser, '家族')).rejects.toThrow(message);
    const faction = await createFaction(asUser, 'Named Faction');
    await expect(
      asUser.mutation(api.factions.update, { id: faction._id, data: { ...faction.data, name: '☀️' } })
    ).rejects.toThrow(message);
    expect((await asUser.query(api.factions.pageBySlug, { slug: faction.slug })).faction.data.name).toBe(
      'Named Faction'
    );
  });

  test('saving a legacy faction at the creation address repairs its URL without renaming it', async () => {
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser, 'Legacy Faction');
    await t.run(async (ctx) => {
      await ctx.db.patch(faction._id, { slug: 'create', data: { ...faction.data, name: 'Create' } });
    });
    const updated = await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...faction.data, name: 'Create' },
    });
    expect(updated.slug).toBe('create-1');
    expect((await asUser.query(api.factions.pageBySlug, { slug: updated.slug })).faction.data.name).toBe('Create');
  });

  test('create rejects a blank faction name at the authoritative boundary', async () => {
    const { asUser } = await authenticatedTest();

    await expect(createFaction(asUser, '   ')).rejects.toThrow(
      'Invalid faction data at name: Faction name is required because it determines the faction URL'
    );
  });

  test('slugTaken answers live, deleted, and free', async () => {
    const { asUser } = await authenticatedTest();
    expect(await asUser.query(api.factions.slugTaken, { slug: 'reserved-faction' })).toBe(null);

    const faction = await createFaction(asUser, 'Reserved Faction');
    expect(await asUser.query(api.factions.slugTaken, { slug: 'reserved-faction' })).toBe('live');

    await asUser.mutation(api.factions.softDelete, { id: faction._id });
    expect(await asUser.query(api.factions.slugTaken, { slug: 'reserved-faction' })).toBe('deleted');
  });

  test('repeated names keep their display text and receive distinct addresses', async () => {
    const { asUser } = await authenticatedTest();
    const factions = [];
    for (let i = 0; i < 3; i += 1) {
      factions.push(await createFaction(asUser, 'House Atreides'));
    }
    expect(factions.map((faction) => faction.slug)).toEqual(['house-atreides', 'house-atreides-1', 'house-atreides-2']);
    for (const faction of factions) {
      const page = await asUser.query(api.factions.pageBySlug, { slug: faction.slug });
      expect(page.faction._id).toBe(faction._id);
      expect(page.faction.data.name).toBe('House Atreides');
    }
  });

  test('a deleted faction reserves its address while its name can be reused on create and rename', async () => {
    const { asUser } = await authenticatedTest();
    const reserved = await createFaction(asUser, 'Reserved Faction');
    await asUser.mutation(api.factions.softDelete, { id: reserved._id });
    const created = await createFaction(asUser, 'Reserved Faction');
    expect(created.slug).toBe('reserved-faction-1');
    const active = await createFaction(asUser, 'Active Faction');
    const renamed = await asUser.mutation(api.factions.update, {
      id: active._id,
      data: { ...active.data, name: 'Reserved Faction' },
    });
    expect(renamed.slug).toBe('reserved-faction-2');
    expect(renamed.data.name).toBe('Reserved Faction');
    await expect(
      asUser.query(api.formerAddresses.resolve, {
        address: { kind: 'faction', slug: active.slug },
      })
    ).resolves.toBe('/factions/reserved-faction-2');
    expect(await asUser.query(api.factions.slugTaken, { slug: reserved.slug })).toBe('deleted');
  });

  test('ordinary saves and spelling-only changes retain a suffix after the base becomes free', async () => {
    const { asUser } = await authenticatedTest();
    const first = await createFaction(asUser, 'House Atreides');
    const second = await createFaction(asUser, 'House Atreides');
    await asUser.mutation(api.factions.update, { id: first._id, data: { ...first.data, name: 'House Corrino' } });
    const saved = await asUser.mutation(api.factions.update, {
      id: second._id,
      data: { ...second.data, logo: first.data.logo },
    });
    expect(saved.slug).toBe(second.slug);
    const spelling = await asUser.mutation(api.factions.update, {
      id: second._id,
      data: { ...second.data, name: 'HOUSE ATREIDES!' },
    });
    expect(spelling.slug).toBe(second.slug);
    expect(spelling.data.name).toBe('HOUSE ATREIDES!');
  });

  test('the repair keeps the active public slug and archives the deleted duplicate', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileActivity');
    aggregateTest.register(t, 'profileDiscovery');
    migrationsTest.register(t);
    const { activeId, deletedId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Faction slug migration owner' });
      await ctx.db.insert('profiles', {
        user_id: ownerId,
        username: 'Faction slug migration owner',
        avatar_url: null,
        account_state: 'active',
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
    await expect(t.query(api.factions.pageBySlug, { slug: 'migrated-faction' })).resolves.toMatchObject({
      faction: { _id: activeId },
    });
  });
});
