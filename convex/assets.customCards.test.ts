/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { publishingCustomCard } from '../src/shared/assets/fixtures/publishingCustomCard';
import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('custom cards save their ordered composition, publish it and join mixed decks', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const created = await owner.mutation(api.assets.create, { type: 'card-custom', data: publishingCustomCard });
  const page = await t.query(api.assets.getPage, { type: 'card-custom', slug: created.slug });
  expect(page?.asset.data).toEqual(publishingCustomCard);
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-custom').eq('asset_id', created.id))
      .unique()
  );
  expect(job?.asset_data).toEqual({ assetId: created.id, slug: created.slug, card: publishingCustomCard });
  const deck = await owner.mutation(api.assets.create, {
    type: 'deck',
    data: { name: 'Reference deck', about: '', cardback: publishingDeckCardback },
  });
  await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: created.id, count: 2 });
  const deckPage = await t.query(api.assets.getPage, { type: 'deck', slug: deck.slug });
  expect(deckPage?.members).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        count: 2,
        member: expect.objectContaining({ type: 'card-custom', name: publishingCustomCard.name }),
      }),
    ])
  );
  const { icon: _icon, ...withoutIcon } = publishingCustomCard;
  const updated = {
    ...withoutIcon,
    name: 'Window reference',
    format: 'decal-window',
    layers: [...publishingCustomCard.layers].reverse(),
  };
  await owner.mutation(api.assets.update, { id: created.id, data: updated });
  const saved = await t.query(api.assets.getPage, { type: 'card-custom', slug: 'window-reference' });
  expect(saved?.asset.data).toEqual(updated);
});

test('custom card writes enforce author access and reject invalid layer content', async () => {
  const t = convexTest(schema, modules);
  const [ownerId, outsiderId] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Owner' }),
    await ctx.db.insert('users', { name: 'Other' }),
  ]);
  const owner = t.withIdentity({ subject: ownerId! });
  await expect(t.mutation(api.assets.create, { type: 'card-custom', data: publishingCustomCard })).rejects.toThrow();
  const created = await owner.mutation(api.assets.create, { type: 'card-custom', data: publishingCustomCard });
  await expect(
    t.withIdentity({ subject: outsiderId! }).mutation(api.assets.update, { id: created.id, data: publishingCustomCard })
  ).rejects.toThrow('Not authorized');
  for (const update of [
    { format: 'square' },
    { layers: [publishingCustomCard.layers[0], publishingCustomCard.layers[0]] },
    { layers: [{ ...publishingCustomCard.layers[0], color: 'url(https://example.com)' }] },
    { layers: [{ ...publishingCustomCard.layers[0], width: 0 }] },
    { layers: [{ ...publishingCustomCard.layers[1], id: 'https://example.com/private.svg' }] },
  ]) {
    await expect(
      owner.mutation(api.assets.update, { id: created.id, data: { ...publishingCustomCard, ...update } })
    ).rejects.toThrow();
  }
  expect((await t.query(api.assets.getPage, { type: 'card-custom', slug: created.slug }))?.asset.data).toEqual(
    publishingCustomCard
  );
});
