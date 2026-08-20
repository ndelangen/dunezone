/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const cardData = (name: string) => ({
  name,
  about: '',
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

    const page = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'hunter-seeker' });
    expect(page?.asset.name).toBe('Hunter-Seeker');
    expect(await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' })).toBeNull();
  });

  test('a viewer without edit capability cannot update, and anonymous viewers get read-only access facts', async () => {
    const t = convexTest(schema, modules);
    const { outsiderId, created } = await seedCard(t);

    await expect(
      t.withIdentity({ subject: outsiderId }).mutation(api.assets.update, { id: created.id, data: cardData('Stolen') })
    ).rejects.toThrow('Not authorized');

    const page = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
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

    expect(await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' })).toBeNull();
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
      .query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(page?.viewerAccess.capabilities.edit).toBe(true);
    expect(page?.viewerAccess.capabilities.delete).toBe(false);

    await expect(
      t.withIdentity({ subject: outsiderId }).mutation(api.assets.softDelete, { id: created.id })
    ).rejects.toThrow('Not authorized');
  });
});

describe('asset group assignment', () => {
  test('the owner hands a card to a group they help run, and the group member gains edit', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, outsiderId, created } = await seedCard(t);
    const groupId = await t.run(async (ctx) => {
      const now = '2026-01-01T00:00:00.000Z';
      const id = await ctx.db.insert('groups', {
        name: 'Arrakeen Rules Council',
        slug: 'arrakeen-rules-council',
        created_at: now,
        created_by: ownerId,
        is_deleted: false,
      });
      for (const userId of [ownerId, outsiderId]) {
        await ctx.db.insert('group_members', {
          group_id: id,
          user_id: userId,
          status: 'active',
          requested_at: now,
          approved_at: now,
          approved_by: ownerId,
        });
      }
      return id;
    });

    await t.withIdentity({ subject: ownerId }).mutation(api.assets.setGroup, { id: created.id, group_id: groupId });

    const page = await t
      .withIdentity({ subject: outsiderId })
      .query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(page?.viewerAccess.assignedGroup?.slug).toBe('arrakeen-rules-council');
    expect(page?.viewerAccess.capabilities.edit).toBe(true);
    /* Reassignment and deletion stay with the owner even once a group can edit. */
    expect(page?.viewerAccess.capabilities.changeGroup).toBe(false);

    await t.withIdentity({ subject: ownerId }).mutation(api.assets.setGroup, { id: created.id, group_id: null });
    const cleared = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(cleared?.viewerAccess.assignedGroup).toBeNull();
  });

  test('a group the viewer cannot add members to is not a valid target', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, outsiderId, created } = await seedCard(t);
    const strangersGroup = await t.run(
      async (ctx) =>
        await ctx.db.insert('groups', {
          name: 'Someone else',
          slug: 'someone-else',
          created_at: '2026-01-01T00:00:00.000Z',
          created_by: outsiderId,
          is_deleted: false,
        })
    );

    await expect(
      t.withIdentity({ subject: ownerId }).mutation(api.assets.setGroup, { id: created.id, group_id: strangersGroup })
    ).rejects.toThrow('Not authorized');
  });
});

const tokenFace = () => ({
  image: '/vector/icon/projectile.svg',
  background: {
    image: '/image/texture/015.jpg',
    colors: ['#4B4C0D', '#262B04'],
    invert: true,
    definition: 0,
    influence: 0.5,
  },
  symbolScale: 1,
  top: 'AXLOTL',
  bottomFirst: 'TANKS',
  bottomSecond: '',
  ring: true,
});

const tokenData = (name: string) => ({
  name,
  about: '',
  front: tokenFace(),
  back: { mode: 'custom', face: tokenFace() },
});

describe('token backsides', () => {
  test('a token points at another token of its own shape, and only one at a time', async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const front = await owner.mutation(api.assets.create, { type: 'token-round', data: tokenData('Axlotl') });
    const backA = await owner.mutation(api.assets.create, { type: 'token-round', data: tokenData('Sietch') });
    const backB = await owner.mutation(api.assets.create, { type: 'token-round', data: tokenData('Spice') });

    await owner.mutation(api.assets.setTokenBack, { id: front.id, back_asset_id: backA.id });
    let page = await t.query(api.assets.getPage, { type: 'token-round', slug: 'axlotl' });
    expect(page?.backToken?.name).toBe('Sietch');

    /* Re-pointing replaces rather than accumulates: the index is not unique, so the mutation clears first. */
    await owner.mutation(api.assets.setTokenBack, { id: front.id, back_asset_id: backB.id });
    page = await t.query(api.assets.getPage, { type: 'token-round', slug: 'axlotl' });
    expect(page?.backToken?.name).toBe('Spice');

    await owner.mutation(api.assets.setTokenBack, { id: front.id, back_asset_id: null });
    page = await t.query(api.assets.getPage, { type: 'token-round', slug: 'axlotl' });
    expect(page?.backToken).toBeNull();
  });

  test('the backside must be the same shape, and never the token itself', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const round = await owner.mutation(api.assets.create, { type: 'token-round', data: tokenData('Axlotl') });
    const square = await owner.mutation(api.assets.create, { type: 'token-square', data: tokenData('Shield') });

    await expect(owner.mutation(api.assets.setTokenBack, { id: round.id, back_asset_id: square.id })).rejects.toThrow(
      'must also be a token-round'
    );
    await expect(owner.mutation(api.assets.setTokenBack, { id: round.id, back_asset_id: round.id })).rejects.toThrow(
      'cannot be its own backside'
    );
    await expect(owner.mutation(api.assets.setTokenBack, { id: created.id, back_asset_id: round.id })).rejects.toThrow(
      'has no backside'
    );
  });

  test('a soft-deleted backside stops resolving without touching the relation', async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const front = await owner.mutation(api.assets.create, { type: 'token-round', data: tokenData('Axlotl') });
    const back = await owner.mutation(api.assets.create, { type: 'token-round', data: tokenData('Sietch') });
    await owner.mutation(api.assets.setTokenBack, { id: front.id, back_asset_id: back.id });

    await owner.mutation(api.assets.softDelete, { id: back.id });

    const page = await t.query(api.assets.getPage, { type: 'token-round', slug: 'axlotl' });
    expect(page?.backToken).toBeNull();
    const relations = await t.run(async (ctx) => await ctx.db.query('asset_relations').collect());
    expect(relations).toHaveLength(1);
  });
});

const deckData = (name: string) => ({
  name,
  about: '',
  cardback: {
    name: 'Treachery',
    background: {
      image: '/image/texture/015.jpg',
      colors: ['#4B4C0D', '#262B04'],
      invert: true,
      definition: 0,
      influence: 0.5,
    },
    image: '/vector/icon/projectile.svg',
    imageScale: 0.55,
    imageOffset: [0, 10],
  },
});

describe('deck composition', () => {
  test('a count is the duplicate mechanism: one row per card, zero removes it', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const deck = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('House Treachery') });

    await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: created.id, count: 3 });
    let page = await t.query(api.assets.getPage, { type: 'deck', slug: 'house-treachery' });
    expect(page?.members).toEqual([expect.objectContaining({ count: 3 })]);

    await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: created.id, count: 5 });
    page = await t.query(api.assets.getPage, { type: 'deck', slug: 'house-treachery' });
    expect(page?.members).toHaveLength(1);
    expect(page?.members[0]?.count).toBe(5);

    await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: created.id, count: 0 });
    page = await t.query(api.assets.getPage, { type: 'deck', slug: 'house-treachery' });
    expect(page?.members).toEqual([]);
    const relations = await t.run(async (ctx) => await ctx.db.query('asset_relations').collect());
    expect(relations).toEqual([]);
  });

  test('a container holds only its own kind, and counts are bounded', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const deck = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('House Treachery') });
    const token = await owner.mutation(api.assets.create, { type: 'token-round', data: tokenData('Axlotl') });

    await expect(
      owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: token.id, count: 1 })
    ).rejects.toThrow('holds cards, not token-round');
    await expect(
      owner.mutation(api.assets.setMemberCount, { container_id: created.id, member_id: created.id, count: 1 })
    ).rejects.toThrow('holds nothing');
    await expect(
      owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: created.id, count: 1.5 })
    ).rejects.toThrow('whole number');
  });

  test('a soft-deleted member leaves the composition without its relation being touched', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const deck = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('House Treachery') });
    await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: created.id, count: 2 });

    await owner.mutation(api.assets.softDelete, { id: created.id });

    const page = await t.query(api.assets.getPage, { type: 'deck', slug: 'house-treachery' });
    expect(page?.members).toEqual([]);
    const relations = await t.run(async (ctx) => await ctx.db.query('asset_relations').collect());
    expect(relations).toHaveLength(1);
  });
});

describe('asset page bundle', () => {
  test('a card reports the decks holding it, a deck reports none, and both report their publication', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const deck = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('House Treachery') });
    await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: created.id, count: 3 });

    const card = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(card?.inDecks).toEqual([
      expect.objectContaining({ id: deck.id, type: 'deck', slug: 'house-treachery', count: 3 }),
    ]);
    /* Saving the card enqueued a publication, so it has capture state but no published asset yet. */
    expect(card?.assetPublishing).toMatchObject({ status: null, captureStatus: 'scheduled', publicationHref: null });

    const page = await t.query(api.assets.getPage, { type: 'deck', slug: 'house-treachery' });
    /* Nothing may hold a deck. Its own Cardback publishes like any other image type since wayfinder #546. */
    expect(page?.inDecks).toEqual([]);
    expect(page?.assetPublishing).toMatchObject({ status: null, captureStatus: 'scheduled', publicationHref: null });
  });

  test('a deck holding a soft-deleted card stops being reported by that card', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const deck = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('House Treachery') });
    await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: created.id, count: 1 });
    await owner.mutation(api.assets.softDelete, { id: deck.id });

    const card = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(card?.inDecks).toEqual([]);
    const relations = await t.run(async (ctx) => await ctx.db.query('asset_relations').collect());
    expect(relations).toHaveLength(1);
  });
});

describe('asset about', () => {
  test('About round-trips through a save, and whitespace never stores', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);

    await t.withIdentity({ subject: ownerId }).mutation(api.assets.update, {
      id: created.id,
      data: { ...cardData('Lasgun'), about: '  A lasgun hitting a shield destroys the territory.\n  ' },
    });

    const page = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(page?.asset.data).toMatchObject({
      about: 'A lasgun hitting a shield destroys the territory.',
    });
  });

  test('an asset with nothing to explain saves with an empty About', async () => {
    const t = convexTest(schema, modules);
    const { created } = await seedCard(t);

    const page = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(page?.asset.data).toMatchObject({ about: '' });
    expect(created.slug).toBe('lasgun');
  });
});

describe('asset publication', () => {
  test('saving a card schedules its publication, and a second save coalesces onto the same job', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);

    const afterCreate = await t.run(
      async (ctx) =>
        await ctx.db
          .query('publication_jobs')
          .withIndex('by_asset_type_and_asset_id', (q) =>
            q.eq('asset_type', 'card-treachery').eq('asset_id', created.id)
          )
          .collect()
    );
    expect(afterCreate).toHaveLength(1);
    expect(afterCreate[0]?.asset_data).toMatchObject({ assetId: created.id, slug: 'lasgun' });

    await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.update, { id: created.id, data: cardData('Hunter-Seeker') });

    const afterUpdate = await t.run(
      async (ctx) =>
        await ctx.db
          .query('publication_jobs')
          .withIndex('by_asset_type_and_asset_id', (q) =>
            q.eq('asset_type', 'card-treachery').eq('asset_id', created.id)
          )
          .collect()
    );
    expect(afterUpdate).toHaveLength(1);
    expect(afterUpdate[0]?.asset_data).toMatchObject({ slug: 'hunter-seeker' });
  });

  test('saving a deck schedules its Cardback, and the payload is the Cardback alone', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Deck owner' }));
    const deck = await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.create, { type: 'deck', data: deckData('House Treachery') });

    const jobs = await t.run(
      async (ctx) =>
        await ctx.db
          .query('publication_jobs')
          .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'deck').eq('asset_id', deck.id))
          .collect()
    );
    expect(jobs).toHaveLength(1);
    /* A deck publishes its Cardback and nothing else, so its name and its About must not reach the render payload. */
    expect(jobs[0]?.asset_data).toEqual({
      assetId: deck.id,
      slug: 'house-treachery',
      cardback: deckData('House Treachery').cardback,
    });
  });

  test('a type with no publication of its own saves without scheduling one', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Token owner' }));
    const token = await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.create, { type: 'token-round', data: tokenData('Axlotl') });

    expect(await t.run(async (ctx) => await ctx.db.query('publication_jobs').collect())).toEqual([]);
    expect(token.slug).toBe('axlotl');
  });
});

const rectangleBackground = {
  image: '/image/texture/015.jpg',
  colors: ['#4B4C0D', '#262B04'],
  invert: true,
  definition: 0,
  influence: 0.5,
};

const rectangleData = (name: string) => ({
  name,
  about: '',
  front: {
    background: rectangleBackground,
    ring: false,
    decals: [
      { id: '/vector/logo/atreides.svg', muted: false, outline: true, scale: 0.9, offset: [-55, -18], opacity: 1 },
    ],
    texts: [{ content: 'KWISATZ\nHADERACH', offset: [-58, 34], size: 15, font: 'C_Copperplate_Gothic', opacity: 1 }],
  },
  back: { mode: 'custom', face: { background: rectangleBackground, ring: true, decals: [], texts: [] } },
});

describe('rectangle tokens', () => {
  test('a free composition round-trips through a save, placed elements and all', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Token owner' }));
    const created = await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.create, { type: 'token-rectangle', data: rectangleData('Kwisatz Haderach') });

    expect(created.slug).toBe('kwisatz-haderach');
    const page = await t.query(api.assets.getPage, { type: 'token-rectangle', slug: 'kwisatz-haderach' });
    expect(page?.asset.data).toEqual(rectangleData('Kwisatz Haderach'));
  });

  test('an unknown font is refused, so a face can never store one the project does not ship', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Token owner' }));
    const data = rectangleData('Bad Font');
    data.front.texts[0]!.font = 'Comic Sans';

    await expect(
      t.withIdentity({ subject: ownerId }).mutation(api.assets.create, { type: 'token-rectangle', data })
    ).rejects.toThrow();
  });
});

describe('bundles', () => {
  const bundleData = (name: string) => ({
    name,
    about: '',
    band: {
      label: 'Tech',
      background: {
        image: '/image/texture/015.jpg',
        colors: ['#4B4C0D', '#262B04'],
        invert: true,
        definition: 0,
        influence: 0.5,
      },
    },
  });

  test('a bundle holds tokens of mixed shapes, and a deck refuses them', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const bundle = await owner.mutation(api.assets.create, { type: 'bundle', data: bundleData('Tech Tokens') });
    const round = await owner.mutation(api.assets.create, { type: 'token-round', data: tokenData('Shield') });
    const gear = await owner.mutation(api.assets.create, { type: 'token-gear', data: tokenData('Ornithopter') });

    await owner.mutation(api.assets.setMemberCount, { container_id: bundle.id, member_id: round.id, count: 20 });
    await owner.mutation(api.assets.setMemberCount, { container_id: bundle.id, member_id: gear.id, count: 1 });

    const page = await t.query(api.assets.getPage, { type: 'bundle', slug: 'tech-tokens' });
    expect(page?.members).toHaveLength(2);
    expect(page?.members.map((entry) => entry.count).sort()).toEqual([1, 20]);

    /* Kind exclusion runs both ways: a bundle refuses cards and a deck refuses tokens. */
    await expect(
      owner.mutation(api.assets.setMemberCount, { container_id: bundle.id, member_id: created.id, count: 1 })
    ).rejects.toThrow('holds tokens, not card-treachery');
  });

  test('a bundle publishes nothing, unlike every other live type', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Bundle owner' }));
    await t.withIdentity({ subject: ownerId }).mutation(api.assets.create, {
      type: 'bundle',
      data: bundleData('Tech Tokens'),
    });

    expect(await t.run(async (ctx) => await ctx.db.query('publication_jobs').collect())).toEqual([]);
    const page = await t.query(api.assets.getPage, { type: 'bundle', slug: 'tech-tokens' });
    expect(page?.assetPublishing).toBeNull();
  });
});
