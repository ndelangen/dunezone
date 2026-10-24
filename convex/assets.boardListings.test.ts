/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { arrakisBoard } from '../src/shared/boards/geometry';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { readBoardListing } from './lib/boardListing';
import { insertMissingOrderItems } from './lib/catalogueOrder';

async function boardFixture(bounded = false) {
  const t = applicationTest(bounded ? { transactionLimits: { bytesRead: 64 * 1024 } } : {});
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { name: 'Board owner' });
    const timestamps = { created_at: '2026-10-20T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z' };
    const asset = await ctx.db.insert('assets', {
      owner_id: owner,
      group_id: null,
      type: 'board',
      slug: 'arrakis',
      is_deleted: false,
      ...timestamps,
      data: { name: 'Arrakis', about: '', board: arrakisBoard() },
    });
    const summary = await ctx.db.insert('board_readiness', {
      asset_id: asset,
      usable: true,
      name: 'Arrakis',
      slug: 'arrakis',
      owner_id: owner,
      group_id: null,
      ...timestamps,
      is_deleted: false,
      asset_creation_time: 1,
    });
    const entryId = await ctx.db.insert('catalogue_entries', {
      kind: 'asset',
      source_id: asset,
      partition: 'board',
      slug: 'arrakis',
      search_text: 'arrakis',
      name_key: 'arrakis',
      created_at: 1,
      updated_at: 1,
      edited_at: 0,
      complexity: 0,
      complexity_score: 0,
      facets: ['board'],
    });
    const entry = await ctx.db.get('catalogue_entries', entryId);
    await insertMissingOrderItems(ctx, entry!, ['name', 'created', 'updated']);
    const ruleset = await ctx.db.insert('rulesets', {
      name: 'Dreamrules',
      slug: 'dreamrules',
      about: 'Rules for listing read verification.',
      owner_id: owner,
      group_id: null,
      is_deleted: false,
      image_cover: null,
      ...timestamps,
    });
    await ctx.db.insert('ruleset_asset_slots', { ruleset_id: ruleset, asset_id: asset, slot: 'board' });
    return { asset, summary };
  });
  return { t, ...ids };
}

test('board listing readers stay under 64 KiB with a real Arrakis definition', async () => {
  const { t, asset } = await boardFixture(true);
  const landing = await t.query(api.assets.cataloguePage, {});
  const catalogue = await t.query(api.assets.catalogue, { type: 'board' });
  expect(catalogue.entries[0]?.id).toBe(asset);
  const picker = await t.query(api.assets.listByTypes, { types: ['board'] });
  const legacyBrowse = await t.query(api.assets.browsePage, { type: 'board' });
  const ruleset = await t.query(api.rulesets.detailPage, { slug: 'dreamrules' });
  const faqPicker = await t.query(api.cataloguePicker.options, {
    group: 'board',
    q: '',
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(faqPicker.page[0]?.choice.id).toBe(asset);
  for (const row of [landing.recent[0], picker[0], legacyBrowse.entries[0]]) {
    expect(row).toMatchObject({ id: asset, name: 'Arrakis', slug: 'arrakis', data: { name: 'Arrakis' } });
    expect(row?.data).not.toHaveProperty('board');
    expect(row?.previewHref).toContain(`/published/boards/${asset}/board.jpg?v=`);
  }
  expect(ruleset?.board).toMatchObject({ id: asset, name: 'Arrakis' });
  /* This proves the budget catches a full definition, rather than only checking the returned payload. */
  await expect(t.run(async (ctx) => await ctx.db.get('assets', asset))).rejects.toThrow(/Read too much data/);
});

test.each(['missing', 'legacy'])('a %s summary retains the authoritative board and listing', async (state) => {
  const { t, asset, summary } = await boardFixture();
  await t.run(async (ctx) => {
    if (state === 'missing') {
      await ctx.db.delete('board_readiness', summary);
    } else {
      await ctx.db.replace('board_readiness', summary, { asset_id: asset, usable: true });
    }
  });
  const row = await t.run(async (ctx) => await readBoardListing(ctx, asset));
  expect(row?.data.board).toBeDefined();
  expect((await t.query(api.assets.cataloguePage, {})).recent[0]?.id).toBe(asset);
  expect((await t.query(api.rulesets.detailPage, { slug: 'dreamrules' }))?.board?.id).toBe(asset);
});

test('an unusable board remains listed and a deleted board stays hidden', async () => {
  const { t, asset, summary } = await boardFixture();
  await t.run(async (ctx) => await ctx.db.patch('board_readiness', summary, { usable: false }));
  expect((await t.query(api.assets.listByTypes, { types: ['board'] }))[0]?.id).toBe(asset);
  await t.run(async (ctx) => {
    await ctx.db.patch('assets', asset, { is_deleted: true });
    await ctx.db.patch('board_readiness', summary, { is_deleted: true });
  });
  expect(await t.query(api.assets.listByTypes, { types: ['board'] })).toEqual([]);
  expect((await t.query(api.rulesets.detailPage, { slug: 'dreamrules' }))?.board).toBeNull();
});

test('a missing summary among complete summaries never hides its board', async () => {
  const { t, asset } = await boardFixture();
  const second = await t.run(async (ctx) => {
    const original = await ctx.db.get('assets', asset);
    const { _id, _creationTime, ...fields } = original!;
    const id = await ctx.db.insert('assets', { ...fields, slug: 'second', data: { ...fields.data, name: 'Second' } });
    await ctx.db.insert('catalogue_entries', {
      kind: 'asset',
      source_id: id,
      partition: 'board',
      slug: 'second',
      search_text: 'second',
      name_key: 'second',
      created_at: 2,
      updated_at: 2,
      edited_at: 0,
      complexity: 0,
      complexity_score: 0,
      facets: ['board'],
    });
    return id;
  });
  const rows = await t.query(api.assets.listByTypes, { types: ['board'] });
  expect(rows.map((row) => row.id)).toEqual([second, asset]);
  expect(rows[0]?.data.board).toBeDefined();
  expect(rows[1]?.data.board).toBeUndefined();
});

test('ten large boards fit listing read budgets without loading their geometry', async () => {
  const { t, summary } = await boardFixture(true);
  for (let index = 2; index <= 10; index += 1) {
    await t.run(async (ctx) => {
      const original = await ctx.db.get('board_readiness', summary);
      const { _id, _creationTime, asset_id: _assetId, ...fields } = original!;
      const name = `Arrakis ${index}`;
      const slug = `arrakis-${index}`;
      const id = await ctx.db.insert('assets', {
        owner_id: fields.owner_id!,
        group_id: null,
        type: 'board',
        slug,
        is_deleted: false,
        created_at: fields.created_at!,
        updated_at: fields.updated_at!,
        data: { name, about: '', board: arrakisBoard() },
      });
      await ctx.db.insert('board_readiness', { ...fields, name, slug, asset_id: id, asset_creation_time: index });
      const entryId = await ctx.db.insert('catalogue_entries', {
        kind: 'asset',
        source_id: id,
        partition: 'board',
        slug,
        search_text: name,
        name_key: name.toLowerCase(),
        created_at: index,
        updated_at: index,
        edited_at: 0,
        complexity: 0,
        complexity_score: 0,
        facets: ['board'],
      });
      const entry = await ctx.db.get('catalogue_entries', entryId);
      await insertMissingOrderItems(ctx, entry!, ['name', 'created', 'updated']);
    });
  }
  expect((await t.query(api.assets.cataloguePage, {})).recent).toHaveLength(5);
  expect(await t.query(api.assets.listByTypes, { types: ['board'] })).toHaveLength(10);
  expect((await t.query(api.assets.catalogue, { type: 'board' })).entries).toHaveLength(10);
});
