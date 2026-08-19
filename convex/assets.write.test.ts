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
