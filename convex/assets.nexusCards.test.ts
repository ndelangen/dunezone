/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('the GF9 import creates twelve published Nexus cards and one deck without overwriting later edits', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const first = await t.mutation(internal.assets.seedGf9NexusDeck, { ownerId });
  expect(first.cardIds).toHaveLength(12);
  const deck = await t.query(api.assets.getPage, { type: 'deck', slug: first.slug });
  expect(deck?.members).toHaveLength(12);
  expect(deck?.members.every(({ count, member }) => count === 1 && member.type === 'card-nexus')).toBe(true);
  for (let index = 0; index < first.cardIds.length; index++) {
    const job = await t.run((ctx) =>
      ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) =>
          q.eq('asset_type', 'card-nexus').eq('asset_id', first.cardIds[index]!)
        )
        .unique()
    );
    expect(job?.asset_data).toEqual({
      assetId: first.cardIds[index],
      slug: deck!.members.find(({ member }) => member.id === first.cardIds[index])!.member.slug,
      card: GF9_NEXUS_CARDS[index],
    });
  }
  const edited = { ...GF9_NEXUS_CARDS[0]!, betrayal: 'A house rule.' };
  await t.withIdentity({ subject: ownerId }).mutation(api.assets.update, { id: first.cardIds[0]!, data: edited });
  const repeat = await t.mutation(internal.assets.seedGf9NexusDeck, { ownerId });
  expect(repeat).toEqual(first);
  expect((await t.query(api.assets.getPage, { type: 'card-nexus', slug: 'atreides' }))?.asset.data).toEqual(edited);
});

test('Nexus writes enforce the fixed sections and reject oversized effects without changing the saved card', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const card = GF9_NEXUS_CARDS[0]!;
  const created = await owner.mutation(api.assets.create, { type: 'card-nexus', data: card });
  for (const update of [
    { subName: 'Custom' },
    { cunning: undefined },
    { factionSymbol: undefined },
    { betrayal: 'a'.repeat(401) },
    { secretAlly: Array(7).fill('line').join('\n') },
    { faction: 'a'.repeat(41) },
    { factionSymbol: { ...card.factionSymbol, image: 'https://example.com/private.svg' } },
    { layers: [] },
  ]) {
    await expect(owner.mutation(api.assets.update, { id: created.id, data: { ...card, ...update } })).rejects.toThrow();
  }
  expect((await t.query(api.assets.getPage, { type: 'card-nexus', slug: created.slug }))?.asset.data).toEqual(card);
  await owner.mutation(api.assets.update, { id: created.id, data: { ...card, cunning: 'a'.repeat(400) } });
  expect(
    (await t.query(api.assets.getPage, { type: 'card-nexus', slug: created.slug }))?.asset.data.cunning
  ).toHaveLength(400);
});

test('a reserved GF9 address rolls back the entire import', async () => {
  const t = convexTest(schema, modules);
  const [ownerId, otherId] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Creator' }),
    await ctx.db.insert('users', { name: 'Other' }),
  ]);
  await t
    .withIdentity({ subject: otherId! })
    .mutation(api.assets.create, { type: 'card-nexus', data: GF9_NEXUS_CARDS[5]! });
  await expect(t.mutation(internal.assets.seedGf9NexusDeck, { ownerId: ownerId! })).rejects.toThrow('already reserved');
  expect(await t.query(api.assets.getPage, { type: 'deck', slug: 'gf9-nexus-deck' })).toBeNull();
  expect(await t.query(api.assets.getPage, { type: 'card-nexus', slug: 'atreides' })).toBeNull();
});

test('a renderer regeneration scan republishes live Nexus cards and skips deleted cards', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const live = await owner.mutation(api.assets.create, { type: 'card-nexus', data: GF9_NEXUS_CARDS[0]! });
  const deleted = await owner.mutation(api.assets.create, { type: 'card-nexus', data: GF9_NEXUS_CARDS[1]! });
  await t.run(async (ctx) => {
    await ctx.db.patch(deleted.id, { is_deleted: true });
    await Promise.all((await ctx.db.query('publication_jobs').collect()).map((job) => ctx.db.delete(job._id)));
  });
  await t.mutation(internal.publicationRegeneration.scan, {
    assetType: 'card-nexus',
    cursor: null,
    scanned: 0,
    enqueued: 0,
  });
  const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
  expect(jobs).toHaveLength(1);
  expect(jobs[0]?.asset_id).toBe(live.id);
  expect(jobs[0]?.asset_data.card).toEqual(GF9_NEXUS_CARDS[0]);
});
