/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import type { convexTest } from 'convex-test';
import { expect, test } from 'vite-plus/test';
import type { z } from 'zod';

import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import type { NexusCardAsset } from '../src/shared/assets/schema';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { assetPageAs } from './viewerAccess.test.fixture';

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

test('Nexus writes enforce the fixed sections and reject oversized effects without changing the saved card', async () => {
  const t = applicationTest();
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

test('new Nexus cards require a live faction and use its authoritative header artwork', async () => {
  const t = applicationTest();
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
  expect((await assetPageAs(t, { type: 'card-nexus', slug: created.slug }))?.asset.data).toEqual(linked);
  await expect(owner.mutation(api.assets.update, { id: created.id, data: GF9_NEXUS_CARDS[0]! })).rejects.toThrow(
    'Choose a faction'
  );
  await t.run((ctx) => ctx.db.patch(linked.factionLink.id, { is_deleted: true }));
  await expect(owner.mutation(api.assets.create, { type: 'card-nexus', data: linked })).rejects.toThrow(
    'available faction'
  );
});
