/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { publisherCaptureSnapshotSchema } from '../src/shared/asset-publishing/publisher-snapshot';
import { GF9_STRONGHOLD_CARDS } from '../src/shared/assets/gf9StrongholdDeck';
import { api, internal } from './_generated/api';
import schema from './schema';
import { assetPageAs } from './viewerAccess.test.fixture';

const modules = import.meta.glob('./**/*.ts');

test('stronghold cards round-trip, publish their constrained face and enforce editing access', async () => {
  const t = convexTest(schema, modules);
  const [ownerId, otherId] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Owner' }),
    await ctx.db.insert('users', { name: 'Other' }),
  ]);
  const owner = t.withIdentity({ subject: ownerId! });
  const data = GF9_STRONGHOLD_CARDS[0]!;
  await expect(t.mutation(api.assets.create, { type: 'card-stronghold', data })).rejects.toThrow('Not authenticated');
  const created = await owner.mutation(api.assets.create, { type: 'card-stronghold', data });
  const page = await assetPageAs(t, { type: 'card-stronghold', slug: created.slug });
  expect(page?.asset.data).toEqual(data);
  expect(page?.asset.previewHref).toContain(`/published/stronghold-cards/${created.id}/card.jpg`);
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-stronghold').eq('asset_id', created.id))
      .unique()
  );
  expect(job?.asset_data).toEqual({ assetId: created.id, slug: created.slug, card: data });
  expect(
    publisherCaptureSnapshotSchema.parse({
      ok: true,
      assetType: 'card-stronghold',
      payload: job!.asset_data,
      payloadHash: '0'.repeat(64),
    }).assetType
  ).toBe('card-stronghold');
  await expect(
    t.withIdentity({ subject: otherId! }).mutation(api.assets.update, { id: created.id, data })
  ).rejects.toThrow('Not authorized');
  for (const extra of [
    { format: 'plain' },
    { textSize: 1 },
    { text: 'a'.repeat(1201) },
    { decals: [{ ...data.decals[0], id: 'https://example.com/art.svg' }] },
  ]) {
    await expect(owner.mutation(api.assets.update, { id: created.id, data: { ...data, ...extra } })).rejects.toThrow();
  }
  const changed = { ...data, name: 'Custom stronghold', text: 'Win tied battles here.' };
  await owner.mutation(api.assets.update, { id: created.id, data: changed });
  expect((await assetPageAs(t, { type: 'card-stronghold', slug: 'custom-stronghold' }))?.asset.data).toEqual(changed);
});

test('the GF9 seed creates six cards and a one-copy deck, and leaves authored changes alone on a second run', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { name: 'Owner' });
    await ctx.db.insert('profiles', {
      user_id: id,
      username: 'Owner',
      avatar_url: null,
      account_state: 'active',
      slug: 'owner',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    });
    return id;
  });
  const created = await t.mutation(internal.assets.seedGf9StrongholdDeck, { ownerProfileSlug: 'owner' });
  const page = await assetPageAs(t, { type: 'deck', slug: created.slug });
  expect(created.created).toBe(true);
  expect(page?.members).toHaveLength(6);
  expect(page?.members?.map(({ member, count }) => ({ name: member.name, type: member.type, count }))).toEqual(
    expect.arrayContaining(GF9_STRONGHOLD_CARDS.map(({ name }) => ({ name, type: 'card-stronghold', count: 1 })))
  );
  const member = page!.members![0]!.member;
  await t
    .withIdentity({ subject: ownerId })
    .mutation(api.assets.update, { id: member.id, data: { ...member.data, text: 'An authored change.' } });
  const repeat = await t.mutation(internal.assets.seedGf9StrongholdDeck, { ownerProfileSlug: 'owner' });
  expect(repeat).toEqual({ ...created, created: false });
  expect((await assetPageAs(t, { type: 'card-stronghold', slug: member.slug }))?.asset.data.text).toBe(
    'An authored change.'
  );
  expect(
    await t.run((ctx) =>
      ctx.db
        .query('assets')
        .withIndex('by_type_deleted', (q) => q.eq('type', 'card-stronghold').eq('is_deleted', false))
        .take(7)
    )
  ).toHaveLength(6);
  await expect(t.mutation(internal.assets.seedGf9StrongholdDeck, { ownerProfileSlug: 'missing' })).rejects.toThrow(
    'active owner'
  );
});

test('stock corrections keep identities and authored content, and are safe to repeat', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Owner' });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Owner',
      avatar_url: null,
      account_state: 'active',
      slug: 'owner',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    });
    return userId;
  });
  const seeded = await t.mutation(internal.assets.seedGf9StrongholdDeck, { ownerProfileSlug: 'owner' });
  const before = (await assetPageAs(t, { type: 'deck', slug: seeded.slug }))!;
  await t.run(async (ctx) => {
    for (const { member } of before.members!) {
      const data = {
        ...member.data,
        decals: member.data.decals.map((decal: { id: string; scale: number }) => ({
          ...decal,
          id: decal.id.replace('/image/decal/gf9-', '/vector/decal/').replace('.png', '-multicolor.svg'),
          scale: 1.65,
        })),
      };
      if (member.name === 'HMS stronghold') {
        data.name = 'Ixian Hidden Mobile Stronghold';
      }
      if (member.name === 'Arrakeen') {
        data.text = 'An authored rule.';
      }
      await ctx.db.patch(member.id, { data });
    }
    await ctx.db.patch(seeded.deckId, {
      data: {
        ...before.asset.data,
        cardback: { ...before.asset.data.cardback, image: '/vector/icon/stronghold.svg', imageScale: 0.55 },
      },
    });
    await ctx.db.insert('assets', {
      owner_id: ownerId,
      type: 'card-stronghold',
      data: {
        ...GF9_STRONGHOLD_CARDS[0],
        name: 'Unrelated',
        decals: [{ ...GF9_STRONGHOLD_CARDS[0]!.decals[0], scale: 1.65 }],
      },
      slug: 'unrelated',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      is_deleted: false,
      group_id: null,
    });
  });
  await expect(t.mutation(internal.assets.polishGf9StrongholdDeck, { ownerProfileSlug: 'missing' })).rejects.toThrow(
    'active GF9'
  );
  await expect(t.mutation(internal.assets.polishGf9StrongholdDeck, { ownerProfileSlug: 'owner' })).resolves.toEqual({
    deckId: seeded.deckId,
    cardsChanged: 6,
    deckChanged: true,
  });
  const after = (await assetPageAs(t, { type: 'deck', slug: seeded.slug }))!;
  expect(after.members!.map(({ member, count }) => ({ id: member.id, count }))).toEqual(
    before.members!.map(({ member, count }) => ({ id: member.id, count }))
  );
  expect(after.members!.find(({ member }) => member.name === 'Arrakeen')!.member.data.text).toBe('An authored rule.');
  expect(after.members!.find(({ member }) => member.name === 'HMS stronghold')!.member.slug).toBe('hms-stronghold');
  expect(after.members!.every(({ member }) => member.data.decals[0].scale === 1.75)).toBe(true);
  expect(after.asset.data.cardback.imageScale).toBe(1.3);
  expect(after.asset.data.cardback.image).toBe('/vector/icon/stronghold-multicolor.svg');
  expect((await assetPageAs(t, { type: 'card-stronghold', slug: 'unrelated' }))!.asset.data.decals[0].scale).toBe(1.65);
  await expect(t.mutation(internal.assets.polishGf9StrongholdDeck, { ownerProfileSlug: 'owner' })).resolves.toEqual({
    deckId: seeded.deckId,
    cardsChanged: 0,
    deckChanged: false,
  });
});
