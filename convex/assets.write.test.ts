/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import { describe, expect, test } from 'vitest';

import { publicationFaceId } from '../src/shared/asset-publishing/publicationTargets';
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
    ).rejects.toThrow('already lives at');
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
    ).rejects.toThrow('stays reserved by a deleted asset');
    expect(await t.query(api.assets.slugTaken, { type: 'card-treachery', slug: 'lasgun' })).toBe('deleted');
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

/** The one writer of a reference since setTokenBack retired: an ordinary save carrying the draft's pick. */
const withReference = (name: string, targetId: string) => ({
  ...tokenData(name),
  back: { mode: 'reference', asset_id: targetId },
});

describe('token backsides', () => {
  test('a token points at another token of its own shape, in data rather than in a relation row', async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const front = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Axlotl') });
    const backA = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Sietch') });
    const backB = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Spice') });

    await owner.mutation(api.assets.update, { id: front.id, data: withReference('Axlotl', backA.id) });
    let page = await t.query(api.assets.getPage, { type: 'token-disc', slug: 'axlotl' });
    expect(page?.backToken?.name).toBe('Sietch');

    /* Re-pointing replaces rather than accumulates: the reference is one field on one row. */
    await owner.mutation(api.assets.update, { id: front.id, data: withReference('Axlotl', backB.id) });
    page = await t.query(api.assets.getPage, { type: 'token-disc', slug: 'axlotl' });
    expect(page?.backToken?.name).toBe('Spice');

    /* The reference lives in data now, so no relation row exists to leak or dangle. */
    const relations = await t.run(async (ctx) => await ctx.db.query('asset_relations').collect());
    expect(relations).toEqual([]);
    const stored = await t.run(async (ctx) => (await ctx.db.get('assets', front.id))?.data);
    expect((stored as { back: unknown }).back).toEqual({ mode: 'reference', asset_id: backB.id });

    /* Clearing is saving another back mode; there is no other verb. */
    await owner.mutation(api.assets.update, {
      id: front.id,
      data: { ...tokenData('Axlotl'), back: { mode: 'same' } },
    });
    page = await t.query(api.assets.getPage, { type: 'token-disc', slug: 'axlotl' });
    expect(page?.backToken).toBeNull();
  });

  test('the backside must be the same shape with an authored back, and never the token itself', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const round = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Axlotl') });
    const square = await owner.mutation(api.assets.create, { type: 'token-plate', data: tokenData('Shield') });
    const unauthored = await owner.mutation(api.assets.create, {
      type: 'token-disc',
      data: { ...tokenData('Mirror'), back: { mode: 'same' } },
    });

    await expect(
      owner.mutation(api.assets.update, { id: round.id, data: withReference('Axlotl', square.id) })
    ).rejects.toThrow('must also be a token-disc');
    await expect(
      owner.mutation(api.assets.update, { id: round.id, data: withReference('Axlotl', round.id) })
    ).rejects.toThrow('same-front-and-back');
    await expect(
      owner.mutation(api.assets.update, { id: round.id, data: withReference('Axlotl', unauthored.id) })
    ).rejects.toThrow('authored back');
    /* A card cannot even express a back: its strict schema refuses the key, which is what retired the old type gate. */
    await expect(
      owner.mutation(api.assets.update, { id: created.id, data: { ...cardData('Lasgun'), back: { mode: 'same' } } })
    ).rejects.toThrow();
  });

  test('a soft-deleted backside stops resolving at read time', async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const front = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Axlotl') });
    const back = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Sietch') });
    await owner.mutation(api.assets.update, { id: front.id, data: withReference('Axlotl', back.id) });

    await owner.mutation(api.assets.softDelete, { id: back.id });

    const page = await t.query(api.assets.getPage, { type: 'token-disc', slug: 'axlotl' });
    expect(page?.backToken).toBeNull();
    /* The stored reference stays: dangling is a read-time judgement, the soft-delete rule for every kind. */
    const stored = await t.run(async (ctx) => (await ctx.db.get('assets', front.id))?.data);
    expect((stored as { back: { asset_id?: string } }).back.asset_id).toBe(back.id);
  });

  test('an ordinary save preserves the picked reference the draft cannot carry', async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const front = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Axlotl') });
    const back = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Sietch') });
    await owner.mutation(api.assets.update, { id: front.id, data: withReference('Axlotl', back.id) });

    /* A tab opened before the draft-based pick shipped submits only the mode; the named tolerance keeps the target one release. */
    await owner.mutation(api.assets.update, {
      id: front.id,
      data: { ...tokenData('Axlotl'), back: { mode: 'reference' } },
    });

    const page = await t.query(api.assets.getPage, { type: 'token-disc', slug: 'axlotl' });
    expect(page?.backToken?.name).toBe('Sietch');
  });

  test('leaving custom mode supersedes the pending back job and schedules no new one', async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const front = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Axlotl') });

    const backId = publicationFaceId(front.id, 'back');
    const backJobs = async () =>
      await t.run(async (ctx) =>
        (await ctx.db.query('publication_jobs').collect()).filter((job) => job.asset_id === backId)
      );
    expect(await backJobs()).toHaveLength(1);

    await owner.mutation(api.assets.update, {
      id: front.id,
      data: { ...tokenData('Axlotl'), back: { mode: 'same' } },
    });

    expect(await backJobs()).toEqual([]);
    const page = await t.query(api.assets.getPage, { type: 'token-disc', slug: 'axlotl' });
    expect(page?.resolvedBack).toMatchObject({ mode: 'same' });
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
    const token = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Axlotl') });

    await expect(
      owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: token.id, count: 1 })
    ).rejects.toThrow('holds cards, not token-disc');
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

  test('saving a token schedules both faces, the back under a qualified id', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Token owner' }));
    const token = await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.create, { type: 'token-disc', data: tokenData('Axlotl') });

    const jobs = await t.run(
      async (ctx) =>
        await ctx.db
          .query('publication_jobs')
          .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'token-disc'))
          .collect()
    );
    expect(jobs.map((job) => job.asset_id).sort()).toEqual([token.id, `${token.id}.back`].sort());
  });

  test('a token whose back is a reference publishes only its front', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Token owner' }));
    const token = await t.withIdentity({ subject: ownerId }).mutation(api.assets.create, {
      type: 'token-disc',
      data: { ...tokenData('Axlotl'), back: { mode: 'reference' } },
    });

    const jobs = await t.run(
      async (ctx) =>
        await ctx.db
          .query('publication_jobs')
          .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'token-disc'))
          .collect()
    );
    /* A referenced back is another token's front and publishes nothing of its own. */
    expect(jobs.map((job) => job.asset_id)).toEqual([token.id]);
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

describe('a token page reports both of its faces', () => {
  test('an authored back has a publication of its own, a referenced back has none, and a card has no second face at all', async () => {
    const t = convexTest(schema, modules);
    const { ownerId, created } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });

    await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Axlotl') });
    await owner.mutation(api.assets.create, {
      type: 'token-disc',
      data: { ...tokenData('Sietch'), back: { mode: 'reference' } },
    });

    const authored = await t.query(api.assets.getPage, { type: 'token-disc', slug: 'axlotl' });
    expect(authored?.backPublishing).toMatchObject({ captureStatus: 'scheduled', publicationHref: null });

    /*
     * A referenced back is another token's front, so this token publishes nothing of its own for it.
     * Read from the stored mode rather than from whether bytes exist: switching a back from authored to referenced orphans the object instead of deleting it.
     */
    const referenced = await t.query(api.assets.getPage, { type: 'token-disc', slug: 'sietch' });
    expect(referenced?.backPublishing).toBeNull();

    const card = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(card?.backPublishing).toBeNull();
    expect(card?.assetPublishing).toMatchObject({ captureStatus: 'scheduled' });
    expect(created.slug).toBe('lasgun');
  });
});

describe('enhance tokens', () => {
  test('a free composition round-trips through a save, placed elements and all', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Token owner' }));
    const created = await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.create, { type: 'token-enhance', data: rectangleData('Kwisatz Haderach') });

    expect(created.slug).toBe('kwisatz-haderach');
    const page = await t.query(api.assets.getPage, { type: 'token-enhance', slug: 'kwisatz-haderach' });
    expect(page?.asset.data).toEqual(rectangleData('Kwisatz Haderach'));
  });

  test('an unknown font is refused, so a face can never store one the project does not ship', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Token owner' }));
    const data = rectangleData('Bad Font');
    data.front.texts[0]!.font = 'Comic Sans';

    await expect(
      t.withIdentity({ subject: ownerId }).mutation(api.assets.create, { type: 'token-enhance', data })
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
    const round = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData('Shield') });
    const gear = await owner.mutation(api.assets.create, { type: 'token-tech', data: tokenData('Ornithopter') });

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

  test('a browse tile carries the faces of the first three live members, and a type that holds nothing carries none', async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await seedCard(t);
    const owner = t.withIdentity({ subject: ownerId });
    const bundle = await owner.mutation(api.assets.create, { type: 'bundle', data: bundleData('Tech Tokens') });
    const names = ['Deleted', 'Shield', 'Lasgun', 'Snooper', 'Fourth'];
    const tokens = [];
    for (const name of names) {
      const token = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData(name) });
      await owner.mutation(api.assets.setMemberCount, { container_id: bundle.id, member_id: token.id, count: 1 });
      tokens.push(token);
    }
    /* The first member goes, so what follows proves the read looks past a deleted row rather than stopping three rows in. */
    await owner.mutation(api.assets.softDelete, { id: tokens[0]!.id });

    const bundles = await t.query(api.assets.browsePage, { type: 'bundle' });
    const members = bundles.entries[0]!.members;
    expect(members.map((member) => member.name)).toEqual(['Shield', 'Lasgun', 'Snooper']);
    /* `type` and `data` are the whole point of this shape: without both, a tile can name a member but not draw it. */
    expect(members.map((member) => member.type)).toEqual(['token-disc', 'token-disc', 'token-disc']);
    expect(members.every((member) => member.data.front)).toBe(true);

    /* A card holds nothing, so its page skips the relation pass rather than reading it once per row to learn zero. */
    const cards = await t.query(api.assets.browsePage, { type: 'card-treachery' });
    expect(cards.entries.every((entry) => entry.members.length === 0)).toBe(true);
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

describe('deck cardback references', () => {
  test("a deck may wear another deck's authored cardback, publishing nothing of its own", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Deck owner' }));
    const owner = t.withIdentity({ subject: ownerId });
    const source = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('Source') });
    const wearer = await owner.mutation(api.assets.create, {
      type: 'deck',
      data: { name: 'Wearer', about: '', cardback: { mode: 'reference', asset_id: source.id } },
    });

    /* Only the authored deck publishes; the reference deck's URL is the resolver's to hand out. */
    const jobs = await t.run(async (ctx) => await ctx.db.query('publication_jobs').collect());
    expect(jobs.map((job) => job.asset_id)).toEqual([source.id]);

    const page = await t.query(api.assets.getPage, { type: 'deck', slug: 'wearer' });
    expect(page?.resolvedBack).toMatchObject({ mode: 'reference' });

    /* List surfaces present the target's composition, so tiles render unchanged. */
    const entries = await t.query(api.assets.listByTypes, { types: ['deck'] });
    const presented = entries.find((entry) => entry.id === wearer.id);
    const presentedData = presented?.data as { cardback: { name?: string } | null } | undefined;
    expect(presentedData?.cardback?.name).toBe('Treachery');
  });

  test('the page query returns the stored reference, never the presented composition', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Deck owner' }));
    const owner = t.withIdentity({ subject: ownerId });
    const source = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('Source') });
    await owner.mutation(api.assets.create, {
      type: 'deck',
      data: { name: 'Wearer', about: '', cardback: { mode: 'reference', asset_id: source.id } },
    });

    /*
     * The editor's reference guard reads this data; a presented composition here would open the deck
     * wearing the target's cardback as its own, and a save would persist the copy.
     */
    const page = await t.query(api.assets.getPage, { type: 'deck', slug: 'wearer' });
    const pageData = page?.asset.data as { cardback: unknown } | undefined;
    expect(pageData?.cardback).toEqual({ mode: 'reference', asset_id: source.id });
  });

  test('a wrapped custom cardback saves, presents its fields, and is referenceable', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Deck owner' }));
    const owner = t.withIdentity({ subject: ownerId });
    const deck = deckData('Wrapped');
    const source = await owner.mutation(api.assets.create, {
      type: 'deck',
      data: { ...deck, cardback: { mode: 'custom', ...deck.cardback } },
    });

    const stored = await t.run(async (ctx) => (await ctx.db.get('assets', source.id))?.data);
    expect((stored as { cardback: { mode?: string } }).cardback.mode).toBe('custom');

    /* List surfaces read the composition through the spread, tag and all. */
    const entries = await t.query(api.assets.listByTypes, { types: ['deck'] });
    const presented = entries.find((entry) => entry.id === source.id)?.data as { cardback: { name?: string } };
    expect(presented.cardback.name).toBe('Treachery');

    /* A wrapped authored cardback is a valid reference target, same as a bare one. */
    await owner.mutation(api.assets.create, {
      type: 'deck',
      data: { name: 'Wearer', about: '', cardback: { mode: 'reference', asset_id: source.id } },
    });
    const page = await t.query(api.assets.getPage, { type: 'deck', slug: 'wearer' });
    expect(page?.resolvedBack).toMatchObject({ mode: 'reference' });
  });

  test('a reference must name a deck whose cardback is authored', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Deck owner' }));
    const owner = t.withIdentity({ subject: ownerId });
    const source = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('Source') });
    const wearer = await owner.mutation(api.assets.create, {
      type: 'deck',
      data: { name: 'Wearer', about: '', cardback: { mode: 'reference', asset_id: source.id } },
    });

    await expect(
      owner.mutation(api.assets.create, {
        type: 'deck',
        data: { name: 'Chained', about: '', cardback: { mode: 'reference', asset_id: wearer.id } },
      })
    ).rejects.toThrow('authored cardback');
  });

  test('a dangling deck reference presents no composition and resolves to the static fallback', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Deck owner' }));
    const owner = t.withIdentity({ subject: ownerId });
    const source = await owner.mutation(api.assets.create, { type: 'deck', data: deckData('Source') });
    const wearer = await owner.mutation(api.assets.create, {
      type: 'deck',
      data: { name: 'Wearer', about: '', cardback: { mode: 'reference', asset_id: source.id } },
    });

    await owner.mutation(api.assets.softDelete, { id: source.id });

    const entries = await t.query(api.assets.listByTypes, { types: ['deck'] });
    const presented = entries.find((entry) => entry.id === wearer.id);
    const presentedData = presented?.data as { cardback: unknown } | undefined;
    expect(presentedData?.cardback).toBeNull();

    const page = await t.query(api.assets.getPage, { type: 'deck', slug: 'wearer' });
    expect(page?.resolvedBack).toEqual({ mode: 'dangling', href: '/web/no-deck-back.svg' });
  });
});

describe('name conflicts', () => {
  test('a colliding name is refused with words that reach the client, and the live check agrees', async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await seedCard(t);

    /* The refusal must be a ConvexError: a plain Error is redacted to "Server Error" in production, which is how finding 19 was born. */
    const attempt = t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.create, { type: 'card-treachery', data: cardData('Lasgun!') });
    await expect(attempt).rejects.toThrow(ConvexError);
    await expect(attempt).rejects.toThrow('another one already lives at "lasgun"');

    /* The editors' subscription reads the same rule, holder kind included, so the warning and the refusal cannot disagree, not even about whether the holder lives. */
    expect(await t.query(api.assets.slugTaken, { type: 'card-treachery', slug: 'lasgun' })).toBe('live');
    expect(await t.query(api.assets.slugTaken, { type: 'card-treachery', slug: 'free-name' })).toBeNull();
    /* Another type may hold the same slug; the reservation is per type. */
    expect(await t.query(api.assets.slugTaken, { type: 'deck', slug: 'lasgun' })).toBeNull();
  });
});
