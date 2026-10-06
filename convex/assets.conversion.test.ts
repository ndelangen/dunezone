/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { publishingCustomCard } from '../src/shared/assets/fixtures/publishingCustomCard';
import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { treacheryToCustomCard } from '../src/shared/assets/treacheryToCustomCard';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
async function setup() {
  const t = convexTest(schema, modules);
  const [ownerId, adminId] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Owner' }),
    await ctx.db.insert('users', { name: 'Administrator', isAdmin: true }),
  ]);
  const owner = t.withIdentity({ subject: ownerId! });
  const admin = t.withIdentity({ subject: adminId! });
  const card = await owner.mutation(api.assets.create, { type: 'card-treachery', data: publishingTreacheryCard });
  return { t, owner, admin, adminId: adminId!, card };
}

test('admin conversion preserves identity and deck membership and replaces pending publication', async () => {
  const { t, owner, admin, card } = await setup();
  const deck = await owner.mutation(api.assets.create, {
    type: 'deck',
    data: { name: 'Mixed deck', about: '', cardback: publishingDeckCardback },
  });
  await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: card.id, count: 3 });
  const retainedPublication = await t.run((ctx) =>
    ctx.db.insert('publication_assets', {
      asset_type: 'card-treachery',
      asset_id: card.id,
      cache_token: 'original',
      published_at: 1,
    })
  );
  const before = await t.run((ctx) => ctx.db.get('assets', card.id));
  await t.run((ctx) =>
    ctx.db.insert('publication_jobs', {
      asset_type: 'card-treachery',
      asset_id: card.id,
      asset_data: { assetId: card.id, slug: card.slug, card: publishingTreacheryCard },
      status: 'in_progress',
      attempt_counter: 1,
      created_at: 1,
      updated_at: 1,
    })
  );
  expect((await admin.query(api.assets.getPage, { type: 'card-treachery', slug: card.slug }))?.canConvertToCustom).toBe(
    true
  );
  expect(await admin.mutation(api.assets.convertTreacheryToCustom, { id: card.id })).toEqual(card);
  expect(await t.run((ctx) => ctx.db.get('publication_assets', retainedPublication))).toMatchObject({
    cache_token: 'original',
  });
  const after = await t.run((ctx) => ctx.db.get('assets', card.id));
  expect(after).toEqual({
    ...before,
    type: 'card-custom',
    data: treacheryToCustomCard(publishingTreacheryCard),
    updated_at: expect.any(String),
  });
  expect(await t.query(api.assets.getPage, { type: 'card-treachery', slug: card.slug })).toBeNull();
  const custom = await owner.query(api.assets.getPage, { type: 'card-custom', slug: card.slug });
  expect(custom?.inDecks).toEqual([expect.objectContaining({ id: deck.id, count: 3 })]);
  expect(custom?.viewerAccess.capabilities.edit).toBe(true);
  const deckPage = await t.query(api.assets.getPage, { type: 'deck', slug: deck.slug });
  expect(deckPage?.members).toEqual([
    expect.objectContaining({ count: 3, member: expect.objectContaining({ id: card.id, type: 'card-custom' }) }),
  ]);
  const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
  expect(
    jobs.filter((job) => job.asset_id === card.id && job.asset_type === 'card-treachery').map((job) => job.status)
  ).toEqual(['in_progress']);
  expect(jobs.find((job) => job.asset_id === card.id && job.asset_type === 'card-custom')?.asset_data).toEqual({
    assetId: card.id,
    slug: card.slug,
    card: after!.data,
  });
  await expect(owner.mutation(api.assets.update, { id: card.id, data: publishingTreacheryCard })).rejects.toThrow();
});

test('conversion requires an active administrator even when the caller owns the card', async () => {
  const { t, owner, admin, card } = await setup();
  expect((await owner.query(api.assets.getPage, { type: 'card-treachery', slug: card.slug }))?.canConvertToCustom).toBe(
    false
  );
  expect((await t.query(api.assets.getPage, { type: 'card-treachery', slug: card.slug }))?.canConvertToCustom).toBe(
    false
  );
  await expect(t.mutation(api.assets.convertTreacheryToCustom, { id: card.id })).rejects.toThrow('Not authenticated');
  await expect(owner.mutation(api.assets.convertTreacheryToCustom, { id: card.id })).rejects.toThrow('Not authorized');
  await admin.mutation(api.assets.convertTreacheryToCustom, { id: card.id });
  await expect(admin.mutation(api.assets.convertTreacheryToCustom, { id: card.id })).rejects.toThrow(
    'Only a live treachery'
  );
});

test.each([false, true])(
  'conversion allocates a new slug when the destination is occupied, deleted=%s',
  async (deleted) => {
    const { t, owner, admin, card } = await setup();
    const conflicting = await owner.mutation(api.assets.create, {
      type: 'card-custom',
      data: { ...publishingCustomCard, name: publishingTreacheryCard.name },
    });
    if (deleted) {
      await owner.mutation(api.assets.softDelete, { id: conflicting.id });
    }
    const converted = await admin.mutation(api.assets.convertTreacheryToCustom, { id: card.id });
    expect(converted).toEqual({ id: card.id, slug: `${card.slug}-1` });
    const row = await t.run((ctx) => ctx.db.get('assets', card.id));
    expect(row).toMatchObject({
      type: 'card-custom',
      slug: converted.slug,
      data: { name: publishingTreacheryCard.name },
    });
    const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
    expect(jobs.find((job) => job.asset_id === card.id && job.asset_type === 'card-custom')?.asset_data).toMatchObject({
      slug: converted.slug,
    });
  }
);

test('deleted or oversized treachery cards are left intact', async () => {
  const { t, owner, admin, card } = await setup();
  await t.run((ctx) =>
    ctx.db.patch(card.id, {
      data: {
        ...publishingTreacheryCard,
        decals: Array.from({ length: 256 }, () => publishingTreacheryCard.decals[0]),
      },
    })
  );
  await expect(admin.mutation(api.assets.convertTreacheryToCustom, { id: card.id })).rejects.toThrow('cannot fit');
  expect((await t.run((ctx) => ctx.db.get('assets', card.id)))?.type).toBe('card-treachery');
  await owner.mutation(api.assets.softDelete, { id: card.id });
  await expect(admin.mutation(api.assets.convertTreacheryToCustom, { id: card.id })).rejects.toThrow(
    'Only a live treachery'
  );
});

test('inactive administrators cannot convert cards', async () => {
  const { t, admin, adminId, card } = await setup();
  await t.run((ctx) => ctx.db.patch(adminId, { account_state: 'deletion_pending' }));
  expect((await admin.query(api.assets.getPage, { type: 'card-treachery', slug: card.slug }))?.canConvertToCustom).toBe(
    false
  );
  await expect(admin.mutation(api.assets.convertTreacheryToCustom, { id: card.id })).rejects.toThrow(
    'Not authenticated'
  );
});
