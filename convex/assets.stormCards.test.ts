/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { standardStormCard } from '../src/shared/assets/standardStormDeck';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { assetPageAs } from './viewerAccess.test.fixture';

const modules = import.meta.glob('./**/*.ts');

test('storm cards publish ordered layers and refresh linked tokens', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const token = await owner.mutation(api.assets.create, {
    type: 'token-disc',
    data: { name: 'Storm token', about: '', front: publishingTokenFace, back: { mode: 'same' } },
  });
  const data = {
    ...standardStormCard(3),
    layers: [
      ...standardStormCard(3).layers,
      {
        kind: 'token',
        layerId: '30000000-3000-4000-8000-300000000003',
        asset_id: token.id,
        offset: [0, 0],
        scale: 1,
        opacity: 1,
        rotation: 0,
      },
    ],
  };
  const created = await owner.mutation(api.assets.create, { type: 'card-storm', data });
  const page = await assetPageAs(owner, { type: 'card-storm', slug: created.slug });
  expect(page?.asset.data).toEqual(data);
  expect(page?.cardTokens?.[token.id]?.name).toBe('Storm token');
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-storm').eq('asset_id', created.id))
      .unique()
  );
  expect(job?.asset_data).toMatchObject({ card: data, tokens: { [token.id]: { name: 'Storm token' } } });
  await owner.mutation(api.assets.update, { id: created.id, data: { ...data, sectors: 6 } });
  expect((await assetPageAs(owner, { type: 'card-storm', slug: created.slug }))?.asset.data).toMatchObject({
    sectors: 6,
    layers: data.layers,
  });
  await owner.mutation(api.assets.update, {
    id: token.id,
    data: { name: 'Changed token', about: '', front: publishingTokenFace, back: { mode: 'same' } },
  });
  await t.mutation(internal.assets.refreshEmbeddedCard, { tokenId: token.id, cardId: created.id });
  const refreshed = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-storm').eq('asset_id', created.id))
      .order('desc')
      .first()
  );
  expect(refreshed?.asset_data).toMatchObject({ tokens: { [token.id]: { name: 'Changed token' } } });
});

test('storm card writes require an author and preserve the fixed identity and movement range', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const data = standardStormCard(3);
  const created = await owner.mutation(api.assets.create, { type: 'card-storm', data });
  for (const update of [
    { sectors: 0 },
    { sectors: 7 },
    { sectors: 1.5 },
    { format: 'plain' },
    { subName: 'Weapon' },
    { icon: [data.icon[0], '/vector/icon/karama.svg'] },
  ]) {
    await expect(owner.mutation(api.assets.update, { id: created.id, data: { ...data, ...update } })).rejects.toThrow();
  }
  await expect(t.mutation(api.assets.create, { type: 'card-storm', data })).rejects.toThrow();
});

test('the standard Storm deck provisions one of each value and reruns without overwriting edits', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const result = await t.mutation(internal.assets.provisionStandardStormDeck, { ownerId });
  expect(result.created).toBe(true);
  expect(result.cardIds).toHaveLength(6);
  const deck = await assetPageAs(t, { type: 'deck', slug: 'standard-storm-deck' });
  expect(deck?.members?.map((row) => row.count)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(deck?.members?.map((row) => row.member.name).sort()).toEqual([
    '1 Sector',
    '2 Sectors',
    '3 Sectors',
    '4 Sectors',
    '5 Sectors',
    '6 Sectors',
  ]);
  expect(deck?.asset.data).toMatchObject({ cardback: { mode: 'preset', key: 'storm' } });
  await t.run(async (ctx) => {
    const jobs = await ctx.db.query('publication_jobs').collect();
    for (const job of jobs) {
      await ctx.db.delete(job._id);
    }
  });
  await t.mutation(internal.publicationRegeneration.scan, {
    assetType: 'card-storm',
    cursor: null,
    scanned: 0,
    enqueued: 0,
  });
  expect(await t.run((ctx) => ctx.db.query('publication_jobs').collect())).toHaveLength(6);
  const owner = t.withIdentity({ subject: ownerId });
  await owner.mutation(api.assets.update, {
    id: result.cardIds[0]!,
    data: { ...standardStormCard(1), about: 'An authored note.' },
  });
  const again = await t.mutation(internal.assets.provisionStandardStormDeck, { ownerId });
  expect(again.created).toBe(false);
  expect((await assetPageAs(t, { type: 'card-storm', slug: '1-sector' }))?.asset.data).toMatchObject({
    about: 'An authored note.',
  });
  await owner.mutation(api.assets.setMemberCount, {
    container_id: result.deckId,
    member_id: result.cardIds[0]!,
    count: 2,
  });
  await expect(t.mutation(internal.assets.provisionStandardStormDeck, { ownerId })).rejects.toThrow('has changed');
});

async function reviewedStormCards(t: ReturnType<typeof convexTest>, cardIds: Id<'assets'>[]) {
  return t.run(async (ctx) =>
    Promise.all(cardIds.map(async (id) => ({ id, data: (await ctx.db.get('assets', id))!.data })))
  );
}

test('reviewed Storm designs replace all six cards and the shared back atomically', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const { cardIds } = await t.mutation(internal.assets.provisionStandardStormDeck, { ownerId });
  await t.run(async (ctx) => {
    for (const id of cardIds) {
      const row = (await ctx.db.get('assets', id))!;
      const data = row.data as ReturnType<typeof standardStormCard>;
      await ctx.db.patch(id, {
        data: { ...data, icon: [data.icon[0], '/vector/icon/storm_disc.svg'], about: 'Keep this note.' },
      });
    }
  });
  const expectedCards = await reviewedStormCards(t, cardIds);
  await t.mutation(internal.assets.replaceStandardStormDesigns, { ownerId, expectedCards, expectedBackRevision: 0 });
  const updated = await reviewedStormCards(t, cardIds);
  expect(updated.map((row) => row.data)).toEqual(
    [1, 2, 3, 4, 5, 6].map((sectors) => ({ ...standardStormCard(sectors), about: 'Keep this note.' }))
  );
  const page = await assetPageAs(t, { type: 'deck', slug: 'standard-storm-deck' });
  expect(page?.cardbackPresets?.find((preset) => preset.key === 'storm')).toMatchObject({
    revision: 1,
    cardback: { image: '/vector/icon/storrm_standalone.svg', imageScale: 0.72 },
  });
});

test('a changed Storm card or back cancels the entire reviewed replacement', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const { cardIds } = await t.mutation(internal.assets.provisionStandardStormDeck, { ownerId });
  const expectedCards = await reviewedStormCards(t, cardIds);
  const owner = t.withIdentity({ subject: ownerId });
  await owner.mutation(api.assets.update, {
    id: cardIds[5]!,
    data: { ...standardStormCard(6), about: 'Edited after review.' },
  });
  const saved = await reviewedStormCards(t, cardIds);
  await expect(
    t.mutation(internal.assets.replaceStandardStormDesigns, { ownerId, expectedCards, expectedBackRevision: 0 })
  ).rejects.toThrow('changed after review');
  expect(await reviewedStormCards(t, cardIds)).toEqual(saved);
  await expect(
    t.mutation(internal.assets.replaceStandardStormDesigns, { ownerId, expectedCards: saved, expectedBackRevision: 1 })
  ).rejects.toThrow('preset changed');
  expect(await reviewedStormCards(t, cardIds)).toEqual(saved);
  await expect(
    t.mutation(internal.assets.replaceStandardStormDesigns, {
      ownerId,
      expectedCards: saved.slice(1),
      expectedBackRevision: 0,
    })
  ).rejects.toThrow('all six');
});
