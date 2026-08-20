/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const cardData = (name: string) => ({
  name,
  subName: 'Weapon - Special',
  head: {
    image: '/image/texture/015.jpg',
    colors: ['#4B4C0D', '#262B04'],
    invert: true,
    definition: 0,
    influence: 0.5,
  },
  icon: [
    {
      image: '/image/texture/015.jpg',
      colors: ['#4B4C0D', '#262B04'],
      invert: true,
      definition: 0,
      influence: 0.5,
    },
    '/vector/icon/projectile.svg',
  ],
  decals: [],
  text: 'Play against one leader.',
});

async function seedCard(t: ReturnType<typeof convexTest>) {
  const { ownerId, outsiderId } = await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { name: 'Owner' });
    const outsider = await ctx.db.insert('users', { name: 'Outsider' });
    return { ownerId: owner, outsiderId: outsider };
  });
  const created = await t
    .withIdentity({ subject: ownerId })
    .mutation(api.assets.create, { type: 'card-treachery', data: cardData('Lasgun') });
  return { ownerId, outsiderId, created };
}

describe('asset update', () => {
  test('the owner updates content, and a rename moves the slug', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);

    const renamed = await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.update, { id: created.id, data: cardData('Hunter-Seeker') });
    expect(renamed.slug).toBe('hunter-seeker');

    const page = await t.query(api.assets.getForEdit, { type: 'card-treachery', slug: 'hunter-seeker' });
    expect(page?.asset.name).toBe('Hunter-Seeker');
    expect(await t.query(api.assets.getForEdit, { type: 'card-treachery', slug: 'lasgun' })).toBeNull();
  });

  test('a viewer without edit capability cannot update, and anonymous viewers get read-only access facts', async () => {
    const t = convexTest(schema, modules);
    const { outsiderId, created } = await seedCard(t);

    await expect(
      t.withIdentity({ subject: outsiderId }).mutation(api.assets.update, { id: created.id, data: cardData('Stolen') })
    ).rejects.toThrow('Not authorized');

    const page = await t.query(api.assets.getForEdit, { type: 'card-treachery', slug: 'lasgun' });
    expect(page?.viewerAccess.viewer.kind).toBe('anonymous');
    expect(page?.viewerAccess.capabilities.edit).toBe(false);
  });

  test('a rename cannot take a slug already reserved in the category', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.create, { type: 'card-treachery', data: cardData('Stunner') });

    await expect(
      t.withIdentity({ subject: ownerId }).mutation(api.assets.update, { id: created.id, data: cardData('Stunner') })
    ).rejects.toThrow('reserved');
  });
});

describe('asset soft delete', () => {
  test('the owner retires a card: it leaves the catalogue, and its slug stays reserved', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);

    await t.withIdentity({ subject: ownerId }).mutation(api.assets.softDelete, { id: created.id });

    expect(await t.query(api.assets.getForEdit, { type: 'card-treachery', slug: 'lasgun' })).toBeNull();
    expect(await t.query(api.assets.listByTypes, { types: ['card-treachery'] })).toEqual([]);
    await expect(
      t
        .withIdentity({ subject: ownerId })
        .mutation(api.assets.create, { type: 'card-treachery', data: cardData('Lasgun') })
    ).rejects.toThrow('reserved');
  });

  test('deletion is owner-only, even for a viewer who may edit', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, outsiderId, created } = await seedCard(t);
    /* A group member may edit and rename a community Asset, but never retire one. Delete stays with the owner. */
    await t.run(async (ctx) => {
      const now = '2026-01-01T00:00:00.000Z';
      const groupId = await ctx.db.insert('groups', {
        name: 'Arrakeen Rules Council',
        slug: 'arrakeen-rules-council',
        created_at: now,
        created_by: ownerId,
        is_deleted: false,
      });
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: outsiderId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ownerId,
      });
      await ctx.db.patch(created.id, { group_id: groupId });
    });

    const page = await t
      .withIdentity({ subject: outsiderId })
      .query(api.assets.getForEdit, { type: 'card-treachery', slug: 'lasgun' });
    expect(page?.viewerAccess.capabilities.edit).toBe(true);
    expect(page?.viewerAccess.capabilities.delete).toBe(false);

    await expect(
      t.withIdentity({ subject: outsiderId }).mutation(api.assets.softDelete, { id: created.id })
    ).rejects.toThrow('Not authorized');
  });
});
