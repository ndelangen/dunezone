/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { variantsFixture } from './factionVariants.test.fixture';
import { linkedNexusCard } from './nexusCards.test.fixture';
import { assetPageAs } from './viewerAccess.test.fixture';

test('Nexus writes enforce the fixed sections and reject oversized effects without changing the saved card', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const card = await linkedNexusCard(t, ownerId, GF9_NEXUS_CARDS[0]!);
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
    await expect(owner.mutation(api.assets.update, { id: created.id, data: { ...card, ...update } })).rejects.toThrow(
      'The Nexus card contains invalid fields'
    );
  }
  expect((await assetPageAs(t, { type: 'card-nexus', slug: created.slug }))?.asset.data).toEqual(card);
  await owner.mutation(api.assets.update, { id: created.id, data: { ...card, cunning: 'a'.repeat(400) } });
  expect((await assetPageAs(t, { type: 'card-nexus', slug: created.slug }))?.asset.data.cunning).toHaveLength(400);
});

test('a renderer regeneration scan republishes live Nexus cards and skips deleted cards', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const liveData = await linkedNexusCard(t, ownerId, GF9_NEXUS_CARDS[0]!);
  const live = await owner.mutation(api.assets.create, { type: 'card-nexus', data: liveData });
  const deleted = await owner.mutation(api.assets.create, {
    type: 'card-nexus',
    data: await linkedNexusCard(t, ownerId, GF9_NEXUS_CARDS[1]!),
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

test('new Nexus cards require a live faction and use its authoritative header artwork', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  await expect(owner.mutation(api.assets.create, { type: 'card-nexus', data: GF9_NEXUS_CARDS[0]! })).rejects.toThrow(
    'Choose a faction'
  );
  const linked = await linkedNexusCard(t, ownerId, GF9_NEXUS_CARDS[0]!);
  const created = await owner.mutation(api.assets.create, {
    type: 'card-nexus',
    data: {
      ...linked,
      faction: 'Wrong',
      factionSymbol: GF9_NEXUS_CARDS[1]!.factionSymbol,
      factionLink: { ...linked.factionLink, slug: 'wrong' },
    },
  });
  expect((await assetPageAs(t, { type: 'card-nexus', slug: created.slug }))?.asset.data).toEqual(linked);
  await expect(owner.mutation(api.assets.update, { id: created.id, data: GF9_NEXUS_CARDS[0]! })).rejects.toThrow(
    'Choose a faction'
  );
  await t.run((ctx) => ctx.db.patch(linked.factionLink.id, { is_deleted: true }));
  await expect(owner.mutation(api.assets.create, { type: 'card-nexus', data: linked })).rejects.toThrow(
    'available faction'
  );
});

test('a Nexus card links a whole faction, stored under the faction’s own id and address with its shared artwork', async () => {
  const { t, owner, familyId, family } = await variantsFixture();
  const card = GF9_NEXUS_CARDS[1]!;
  const created = await owner.mutation(api.assets.create, {
    type: 'card-nexus',
    data: { ...card, factionLink: { id: familyId, slug: 'wrong' } },
  });
  const shared = (await family()).data!;
  expect((await assetPageAs(t, { type: 'card-nexus', slug: created.slug }))?.asset.data).toEqual({
    ...card,
    factionLink: { id: familyId, slug: 'atreides' },
    faction: shared.name,
    factionSymbol: { image: shared.emblem, background: shared.background },
    icon: [shared.background, shared.emblem],
  });
});

test('a live variant’s id is stored as its faction’s, and a deleted variant’s is refused', async () => {
  const { t, owner, addVariant, familyId } = await variantsFixture();
  const variant = await addVariant('Dreamrules');
  const retired = await addVariant('Retired');
  const card = GF9_NEXUS_CARDS[0]!;
  const familyLink = { id: familyId, slug: 'atreides' };
  const created = await owner.mutation(api.assets.create, {
    type: 'card-nexus',
    data: { ...card, factionLink: { id: variant.id, slug: variant.slug } },
  });
  const stored = async () => (await assetPageAs(t, { type: 'card-nexus', slug: created.slug }))?.asset.data;
  expect((await stored())?.factionLink).toEqual(familyLink);

  await t.run(async (ctx) => {
    const row = (await ctx.db.get('assets', created.id))!;
    await ctx.db.patch('assets', created.id, {
      data: { ...row.data, factionLink: { id: variant.id, slug: variant.slug } },
    });
  });
  await owner.mutation(api.assets.update, { id: created.id, data: { ...(await stored()), cunning: 'Changed' } });
  expect(await stored()).toMatchObject({ cunning: 'Changed', factionLink: familyLink });

  await owner.mutation(api.factions.softDelete, { id: retired.id });
  await expect(
    owner.mutation(api.assets.update, {
      id: created.id,
      data: { ...card, factionLink: { id: retired.id, slug: retired.slug } },
    })
  ).rejects.toThrow('available faction');
});

test('a deleted faction, or one left without a live variant, cannot be linked', async () => {
  const { owner, root, familyId, family } = await variantsFixture();
  const data = { ...GF9_NEXUS_CARDS[0]!, factionLink: { id: familyId, slug: 'atreides' } };
  await owner.mutation(api.factions.softDelete, { id: root._id });
  expect((await family()).is_deleted).toBe(true);
  await expect(owner.mutation(api.assets.create, { type: 'card-nexus', data })).rejects.toThrow('available faction');
});
