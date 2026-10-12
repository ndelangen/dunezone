/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import type { z } from 'zod';

import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import type { NexusCardAsset } from '../src/shared/assets/schema';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function linkedCard(
  t: ReturnType<typeof convexTest>,
  ownerId: Id<'users'>,
  card: z.infer<typeof NexusCardAsset>
) {
  const slug = card.faction.toLowerCase().replaceAll(' ', '-');
  const id = await t.run((ctx) =>
    ctx.db.insert('factions', {
      owner_id: ownerId,
      data: {
        ...assetPublishingFaction,
        name: card.faction,
        logo: card.factionSymbol.image,
        background: card.factionSymbol.background,
      },
      slug,
      created_at: '2026-10-12T00:00:00Z',
      updated_at: '2026-10-12T00:00:00Z',
      is_deleted: false,
      group_id: null,
    })
  );
  return { ...card, factionLink: { id, slug } };
}

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
  const card = await linkedCard(t, ownerId, GF9_NEXUS_CARDS[0]!);
  const created = await owner.mutation(api.assets.create, { type: 'card-nexus', data: card });
  for (const update of [
    { subName: 'Custom' },
    { cunning: undefined },
    { factionSymbol: undefined },
    { betrayal: 'a'.repeat(401) },
    { secretAlly: Array(7).fill('line').join('\n') },
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
    .mutation(api.assets.create, { type: 'card-nexus', data: await linkedCard(t, otherId!, GF9_NEXUS_CARDS[5]!) });
  await expect(t.mutation(internal.assets.seedGf9NexusDeck, { ownerId: ownerId! })).rejects.toThrow('already reserved');
  expect(await t.query(api.assets.getPage, { type: 'deck', slug: 'gf9-nexus-deck' })).toBeNull();
  expect(await t.query(api.assets.getPage, { type: 'card-nexus', slug: 'atreides' })).toBeNull();
});

test('a renderer regeneration scan republishes live Nexus cards and skips deleted cards', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const liveData = await linkedCard(t, ownerId, GF9_NEXUS_CARDS[0]!);
  const live = await owner.mutation(api.assets.create, { type: 'card-nexus', data: liveData });
  const deleted = await owner.mutation(api.assets.create, {
    type: 'card-nexus',
    data: await linkedCard(t, ownerId, GF9_NEXUS_CARDS[1]!),
  });
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
  expect(jobs[0]?.asset_data.card).toEqual(liveData);
});

const ORIGINAL_CARD_ABOUT =
  'GF9 Ecaz & Moritani Nexus card. Rules paraphrased from the printed card. Reference: https://boardgamegeek.com/image/7767032/dune-ecaz-and-moritani';
const ORIGINAL_DECK_ABOUT =
  "The twelve Nexus cards from GF9's Ecaz & Moritani expansion, one of each faction. Rules follow the printed deck. Card artwork is recreated for Dune Zone.";

async function stageOriginalImport(
  t: ReturnType<typeof convexTest>,
  ids: { deckId: Id<'assets'>; cardIds: Id<'assets'>[] }
) {
  await t.run(async (ctx) => {
    for (const id of [ids.deckId, ...ids.cardIds]) {
      const row = await ctx.db.get('assets', id);
      if (!row) {
        throw new Error('Missing imported asset');
      }
      await ctx.db.patch(row._id, {
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        data: {
          ...row.data,
          about: id === ids.deckId ? ORIGINAL_DECK_ABOUT : ORIGINAL_CARD_ABOUT,
          ...(id === ids.deckId ? {} : { betrayal: 'The earlier paraphrased effect.' }),
        },
      });
    }
  });
}

test('the GF9 correction preserves later edits, ids and membership and republishes only corrected assets', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const imported = await t.mutation(internal.assets.seedGf9NexusDeck, { ownerId });
  await stageOriginalImport(t, imported);
  const houseRule = { ...GF9_NEXUS_CARDS[0]!, betrayal: 'My house rule.' };
  await t.withIdentity({ subject: ownerId }).mutation(api.assets.update, { id: imported.cardIds[0]!, data: houseRule });
  const result = await t.mutation(internal.assets.correctGf9NexusDeck, { ownerId });
  expect(result.deckId).toBe(imported.deckId);
  expect(result.deckUpdated).toBe(true);
  expect(result.updated).toHaveLength(11);
  expect(result.preserved).toEqual(['Atreides']);
  const deck = await t.query(api.assets.getPage, { type: 'deck', slug: imported.slug });
  expect(deck?.members).toHaveLength(12);
  expect(deck?.members.map((member) => member.count)).toEqual(Array(12).fill(1));
  expect((await t.query(api.assets.getPage, { type: 'card-nexus', slug: 'atreides' }))?.asset.data).toEqual(houseRule);
  const fremen = await t.query(api.assets.getPage, { type: 'card-nexus', slug: 'fremen' });
  expect(fremen?.asset.data).toEqual(GF9_NEXUS_CARDS.find((card) => card.faction === 'Fremen'));
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) =>
        q.eq('asset_type', 'card-nexus').eq('asset_id', imported.cardIds[5]!)
      )
      .unique()
  );
  expect(job?.asset_data.card).toEqual(fremen?.asset.data);
  const again = await t.mutation(internal.assets.correctGf9NexusDeck, { ownerId });
  expect(again.updated).toEqual([]);
  expect(again.unchanged).toHaveLength(11);
  expect(again.deckUpdated).toBe(false);
  expect(again.preserved).toEqual(['Atreides']);
});

test('an unexpected GF9 card owner rolls the entire correction back', async () => {
  const t = convexTest(schema, modules);
  const [ownerId, otherId] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Creator' }),
    await ctx.db.insert('users', { name: 'Other' }),
  ]);
  const imported = await t.mutation(internal.assets.seedGf9NexusDeck, { ownerId: ownerId! });
  await stageOriginalImport(t, imported);
  await t.run((ctx) => ctx.db.patch(imported.cardIds[11]!, { owner_id: otherId! }));
  await expect(t.mutation(internal.assets.correctGf9NexusDeck, { ownerId: ownerId! })).rejects.toThrow(
    'no longer belongs'
  );
  expect((await t.query(api.assets.getPage, { type: 'card-nexus', slug: 'atreides' }))?.asset.data.betrayal).toBe(
    'The earlier paraphrased effect.'
  );
});

test('a renamed deck member is preserved even when another card takes its original address', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const imported = await t.mutation(internal.assets.seedGf9NexusDeck, { ownerId });
  await stageOriginalImport(t, imported);
  const owner = t.withIdentity({ subject: ownerId });
  const renamed = { ...GF9_NEXUS_CARDS[0]!, name: 'My Atreides', betrayal: 'My house rule.' };
  await owner.mutation(api.assets.update, { id: imported.cardIds[0]!, data: renamed });
  const separate = await linkedCard(t, ownerId, { ...GF9_NEXUS_CARDS[0]!, betrayal: 'An unrelated card.' });
  await owner.mutation(api.assets.create, { type: 'card-nexus', data: separate });
  const result = await t.mutation(internal.assets.correctGf9NexusDeck, { ownerId });
  expect(result.updated).toHaveLength(11);
  expect(result.preserved).toEqual(['My Atreides']);
  expect((await t.query(api.assets.getPage, { type: 'card-nexus', slug: 'my-atreides' }))?.asset.data).toEqual(renamed);
  expect((await t.query(api.assets.getPage, { type: 'card-nexus', slug: 'atreides' }))?.asset.data).toEqual(separate);
  const deck = await t.query(api.assets.getPage, { type: 'deck', slug: imported.slug });
  expect(deck?.members).toHaveLength(12);
  expect(deck?.members.map(({ member }) => member.id).sort()).toEqual([...imported.cardIds].sort());
});

test('new Nexus cards require a live faction and use its authoritative header artwork', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  await expect(owner.mutation(api.assets.create, { type: 'card-nexus', data: GF9_NEXUS_CARDS[0]! })).rejects.toThrow(
    'Choose a faction'
  );
  const linked = await linkedCard(t, ownerId, GF9_NEXUS_CARDS[0]!);
  const created = await owner.mutation(api.assets.create, {
    type: 'card-nexus',
    data: {
      ...linked,
      faction: 'Wrong',
      factionSymbol: GF9_NEXUS_CARDS[1]!.factionSymbol,
      factionLink: { ...linked.factionLink, slug: 'wrong' },
    },
  });
  expect((await t.query(api.assets.getPage, { type: 'card-nexus', slug: created.slug }))?.asset.data).toEqual(linked);
  await expect(owner.mutation(api.assets.update, { id: created.id, data: GF9_NEXUS_CARDS[0]! })).rejects.toThrow(
    'Choose a faction'
  );
  await t.run((ctx) => ctx.db.patch(linked.factionLink.id, { is_deleted: true }));
  await expect(owner.mutation(api.assets.create, { type: 'card-nexus', data: linked })).rejects.toThrow(
    'available faction'
  );
});
