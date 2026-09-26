/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { INITIAL_CARDBACK_PRESETS } from '../src/shared/assets/cardbackPresets';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const cardback = INITIAL_CARDBACK_PRESETS.find((preset) => preset.key === 'traitor')!.cardback;
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    admin: await ctx.db.insert('users', { isAdmin: true }),
    author: await ctx.db.insert('users', {}),
  }));
  await t.mutation(internal.publicationAdmin.initialize, { rendererRevisions: { 'cardback-preset': 1 } });
  return { t, admin: t.withIdentity({ subject: ids.admin }), author: t.withIdentity({ subject: ids.author }) };
}

test('only an Administrator saves presets, with a revision check against concurrent edits', async () => {
  const { t, admin, author } = await fixture();
  const save = { key: 'traitor' as const, cardback, revision: 0 };
  await expect(t.mutation(api.cardbackPresets.save, save)).rejects.toThrow('Not authenticated');
  await expect(author.mutation(api.cardbackPresets.save, save)).rejects.toThrow('Not authorized');
  expect(await t.query(api.cardbackPresets.editor, {})).toEqual({ access: 'anonymous', presets: [] });
  expect(await author.query(api.cardbackPresets.editor, {})).toEqual({ access: 'denied', presets: [] });
  expect(await admin.mutation(api.cardbackPresets.save, save)).toBe(1);
  await expect(admin.mutation(api.cardbackPresets.save, save)).rejects.toThrow('changed elsewhere');
});

async function publishedDecks() {
  const { t, admin, author } = await fixture();
  await admin.mutation(api.cardbackPresets.save, { key: 'traitor', cardback, revision: 0 });
  for (const name of ['First deck', 'Second deck']) {
    await author.mutation(api.assets.create, {
      type: 'deck',
      data: { name, about: '', cardback: { mode: 'preset', key: 'traitor' } },
    });
  }
  await author.mutation(api.assets.create, {
    type: 'deck',
    data: { name: 'Custom deck', about: '', cardback: { mode: 'custom', ...cardback } },
  });
  const publish = async (cacheToken: string) => {
    const jobId = await t.run(async (ctx) => {
      const job = await ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'cardback-preset').eq('asset_id', 'traitor'))
        .first();
      await ctx.db.patch(job!._id, { status: 'in_progress', expires_at: Date.now() + 10_000 });
      return job!._id;
    });
    const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId });
    await t.mutation(internal.publicationJobs.completeJob, { jobId, cacheToken, payloadHash: snapshot!.payloadHash });
  };
  await publish('first');
  const page = async (slug: string) => {
    const result = await t.query(api.assets.getPage, { type: 'deck', slug });
    expect(result, `Fixture deck ${slug} must exist`).not.toBeNull();
    return result!;
  };
  return { t, admin, page, publish };
}

test('linked decks share a publication and follow a successful replacement while matching custom backs stay custom', async () => {
  const { t, admin, page, publish } = await publishedDecks();
  const first = await page('first-deck');
  expect(first.resolvedBack).toEqual({
    mode: 'preset',
    href: '/published/cardback-presets/traitor/cardback.jpg?v=first',
  });
  expect((await page('second-deck')).resolvedBack).toEqual(first.resolvedBack);
  expect(first.asset.data.cardback).toEqual({ mode: 'preset', key: 'traitor' });
  await admin.mutation(api.cardbackPresets.save, {
    key: 'traitor',
    cardback: { ...cardback, name: 'Traitors' },
    revision: 1,
  });
  await publish('second');
  expect((await page('second-deck')).resolvedBack?.href).toContain('?v=second');
  expect((await page('custom-deck')).asset.data.cardback).toEqual({ mode: 'custom', ...cardback });
  const catalogue = await t.query(api.assets.listByTypes, { types: ['deck'] });
  expect(catalogue.find((entry) => entry.slug === 'first-deck')?.previewHref).toContain('?v=second');
});

test('failed replacements keep the previous shared publication until a retry succeeds', async () => {
  const { t, admin, page, publish } = await publishedDecks();
  const first = await page('first-deck');
  await admin.mutation(api.cardbackPresets.save, {
    key: 'traitor',
    cardback: { ...cardback, name: 'Traitors' },
    revision: 1,
  });
  await t.run(async (ctx) => {
    const job = await ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'cardback-preset').eq('asset_id', 'traitor'))
      .first();
    await ctx.db.patch(job!._id, { status: 'error', error: 'Capture failed' });
  });
  expect((await page('first-deck')).resolvedBack).toEqual(first.resolvedBack);
  expect(
    (await admin.query(api.cardbackPresets.editor, {})).presets.find((entry) => entry.key === 'traitor')?.captureStatus
  ).toBe('error');
  await admin.mutation(api.cardbackPresets.save, {
    key: 'traitor',
    cardback: { ...cardback, name: 'Traitors' },
    revision: 2,
  });
  await publish('second');
  expect((await page('second-deck')).resolvedBack?.href).toContain('?v=second');
});

test('publisher activation seeds once and regeneration keeps saved definitions', async () => {
  const { t, admin } = await fixture();
  const scan = { assetType: 'cardback-preset', cursor: null, scanned: 0, enqueued: 0 };
  await t.mutation(internal.publicationRegeneration.scan, scan);
  const presets = await t.query(api.cardbackPresets.list, {});
  expect(presets).toHaveLength(4);
  await admin.mutation(api.cardbackPresets.save, {
    key: 'traitor',
    cardback: { ...cardback, name: 'Saved design' },
    revision: 1,
  });
  await t.mutation(internal.publicationRegeneration.scan, scan);
  expect((await t.query(api.cardbackPresets.list, {})).find((entry) => entry.key === 'traitor')?.cardback.name).toBe(
    'Saved design'
  );
});

test('decks on different presets each read their own preset in one query', async () => {
  const { t, admin, author } = await fixture();
  for (const key of ['traitor', 'spice'] as const) {
    const design = INITIAL_CARDBACK_PRESETS.find((preset) => preset.key === key)!.cardback;
    await admin.mutation(api.cardbackPresets.save, { key, cardback: design, revision: 0 });
    await author.mutation(api.assets.create, {
      type: 'deck',
      data: { name: `${key} deck`, about: '', cardback: { mode: 'preset', key } },
    });
    const jobId = await t.run(async (ctx) => {
      const job = await ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'cardback-preset').eq('asset_id', key))
        .first();
      await ctx.db.patch(job!._id, { status: 'in_progress', expires_at: Date.now() + 10_000 });
      return job!._id;
    });
    const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId });
    await t.mutation(internal.publicationJobs.completeJob, {
      jobId,
      cacheToken: key,
      payloadHash: snapshot!.payloadHash,
    });
  }
  const listing = await t.query(api.assets.listByTypes, { types: ['deck'] });
  expect(listing.map((entry) => [entry.slug, entry.previewHref])).toEqual([
    ['spice-deck', '/published/cardback-presets/spice/cardback.jpg?v=spice'],
    ['traitor-deck', '/published/cardback-presets/traitor/cardback.jpg?v=traitor'],
  ]);
  const page = await t.query(api.assets.getPage, { type: 'deck', slug: 'spice-deck' });
  expect(page?.cardbackPresets.map((preset) => preset.key)).toEqual(INITIAL_CARDBACK_PRESETS.map(({ key }) => key));
});
