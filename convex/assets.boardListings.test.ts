/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { arrakisBoard } from '../src/shared/boards/geometry';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

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
    const backfill = await ctx.db.insert('migration_runs', {
      migration_id: 'board_readiness_listing_v1',
      state: 'success',
      is_done: true,
      processed: 1,
      latest_start: 1,
      latest_end: 2,
      updated_at: timestamps.updated_at,
    });
    await ctx.db.insert('catalogue_entries', {
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
    return { asset, summary, backfill };
  });
  return { t, ...ids };
}

test('board listing readers stay under 64 KiB with a real Arrakis definition', async () => {
  const { t, asset } = await boardFixture(true);
  const landing = await t.query(api.assets.cataloguePage, {});
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
  const { t, asset, summary, backfill } = await boardFixture();
  await t.run(async (ctx) => {
    await ctx.db.delete('migration_runs', backfill);
    if (state === 'missing') {
      await ctx.db.delete('board_readiness', summary);
    } else {
      await ctx.db.replace('board_readiness', summary, { asset_id: asset, usable: true });
    }
  });
  const [row] = await t.query(api.assets.listByTypes, { types: ['board'] });
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

test('an incomplete backfill preserves source order and membership among mixed summaries', async () => {
  const { t, asset, backfill } = await boardFixture();
  const second = await t.run(async (ctx) => {
    await ctx.db.patch('migration_runs', backfill, { state: 'inProgress', is_done: false });
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
  expect(rows[1]?.data.board).toBeDefined();
});

test('five landing tiles stay under 64 KiB among 1,024 board summaries', async () => {
  const { t, summary } = await boardFixture(true);
  const expected = await t.run(async (ctx) => {
    const first = (await ctx.db.get('board_readiness', summary))!;
    const { _id, _creationTime, ...fields } = first;
    const ids = [];
    for (let i = 1; i < 1024; i += 1) {
      const name = `Board ${i}`;
      const asset = await ctx.db.insert('assets', {
        owner_id: first.owner_id!,
        group_id: null,
        type: 'board',
        slug: `board-${i}`,
        created_at: first.created_at!,
        updated_at: first.updated_at!,
        is_deleted: false,
        data: i >= 1019 ? { name, about: '', board: arrakisBoard() } : { name, about: '' },
      });
      await ctx.db.insert('board_readiness', {
        ...fields,
        asset_id: asset,
        usable: i >= 1019,
        name,
        slug: `board-${i}`,
        asset_creation_time: i + 1,
      });
      if (i >= 1019) {
        ids.unshift(asset);
      }
    }
    return ids;
  });
  const page = await t.query(api.assets.cataloguePage, {});
  expect(page.recent.map((row) => row.id)).toEqual(expected);
  expect(page.recent.every((row) => !Object.hasOwn(row.data, 'board'))).toBe(true);
});

test.each([
  { state: 'success', is_done: false },
  { state: 'failed', is_done: true },
] as const)('an unready migration marker retains the bounded source read: %j', async (state) => {
  const { t, backfill } = await boardFixture();
  await t.run(async (ctx) => await ctx.db.patch('migration_runs', backfill, state));
  expect((await t.query(api.assets.listByTypes, { types: ['board'] }))[0]?.data.board).toBeDefined();
});

test('a selected incomplete summary still reads its source after the backfill', async () => {
  const { t, summary } = await boardFixture();
  await t.run(async (ctx) => await ctx.db.patch('board_readiness', summary, { name: undefined }));
  expect((await t.query(api.assets.listByTypes, { types: ['board'] }))[0]?.data.board).toBeDefined();
});
