/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { expect, test } from 'vite-plus/test';

import { ASSET_TYPE_KEYS } from '../src/shared/assets/types';
import { SITEMAP_RECORD_COLLECTIONS } from '../src/shared/publicDiscovery';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('discovery crosses page bounds, omits deleted records and keeps type-scoped slugs', async () => {
  const t = convexTest(schema, modules);
  const renamed = await t.run(async (ctx) => {
    const owner_id = await ctx.db.insert('users', { name: 'Owner' });
    const row = {
      owner_id,
      group_id: null,
      is_deleted: false,
      data: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-02T00:00:00.000Z',
    };
    for (let i = 0; i < 205; i += 1) {
      await ctx.db.insert('factions', { ...row, slug: `faction-${i}` });
    }
    await ctx.db.insert('factions', { ...row, slug: 'deleted', is_deleted: true });
    const renamed = await ctx.db.insert('factions', { ...row, slug: 'old-name' });
    await ctx.db.insert('assets', { ...row, slug: 'same-name', type: 'token-disc' });
    await ctx.db.insert('assets', { ...row, slug: 'same-name', type: 'card-treachery', updated_at: 'unknown' });
    await ctx.db.insert('assets', { ...row, slug: 'deleted', type: 'token-disc', is_deleted: true });
    return renamed;
  });
  await t.run(async (ctx) => await ctx.db.patch(renamed, { slug: 'new-name' }));
  const first = await t.query(api.publicSitemap.page, { collection: 'factions', cursor: null });
  expect(first.entries).toHaveLength(200);
  expect(first.cursor).not.toBeNull();
  const second = await t.query(api.publicSitemap.page, { collection: 'factions', cursor: first.cursor });
  expect(second.cursor).toBeNull();
  const paths = [...first.entries, ...second.entries].map((entry) => entry.pathname);
  expect(paths).toHaveLength(206);
  expect(new Set(paths).size).toBe(206);
  expect(paths).toContain('/factions/new-name');
  expect(paths).not.toContain('/factions/old-name');
  expect(paths).not.toContain('/factions/deleted');
  await expect(t.query(api.publicSitemap.page, { collection: 'token-disc', cursor: null })).resolves.toMatchObject({
    entries: [
      {
        pathname: '/assets/token-disc/same-name',
        lastmod: '2026-02-02T00:00:00.000Z',
        images: [expect.stringMatching(/^\/published\/round-tokens\/[^/]+\/token\.jpg\?v=2026-02-02/)],
      },
    ],
    cursor: null,
  });
  await expect(t.query(api.publicSitemap.page, { collection: 'card-treachery', cursor: null })).resolves.toMatchObject({
    entries: [{ pathname: '/assets/card-treachery/same-name', lastmod: null }],
    cursor: null,
  });
  await expect(t.query(api.publicSitemap.page, { collection: 'board', cursor: null })).resolves.toEqual({
    entries: [],
    cursor: null,
  });
});

test('rulesets, rulebooks, FAQ questions, profiles and Groups list only what their public pages serve', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { name: 'Owner' });
    const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-03-03T00:00:00.000Z' };
    const ruleset = { ...stamp, about: '', owner_id: owner, group_id: null, image_cover: null };
    const live = await ctx.db.insert('rulesets', { ...ruleset, name: 'Dream', slug: 'dream', is_deleted: false });
    const gone = await ctx.db.insert('rulesets', { ...ruleset, name: 'Gone', slug: 'gone', is_deleted: true });
    const rulebook = { ...stamp, sort_order: 0, current_edition_number: 1, created_by: owner, deleted_at: null };
    const rulebooks = [
      [live, 'core', false],
      [live, 'old', true],
      [live, 'create', false],
      [gone, 'orphan', false],
    ] as const;
    for (const [ruleset_id, slug, is_deleted] of rulebooks) {
      await ctx.db.insert('rulebooks', { ...rulebook, ruleset_id, name: slug, name_key: slug, slug, is_deleted });
    }
    const faq = { ...stamp, question: 'Q?', asked_by: owner, accepted_answer_id: null };
    await ctx.db.insert('faq_items', { ...faq, ruleset_id: live, slug: 'storm-order' });
    await ctx.db.insert('faq_items', { ...faq, ruleset_id: gone, slug: 'hidden' });
    const profile = { ...stamp, user_id: owner, avatar_url: null };
    const states = [
      ['ana', 'active'],
      ['bo', 'deleted'],
      ['dee', 'merge_pending'],
    ] as const;
    for (const [slug, account_state] of states) {
      await ctx.db.insert('profiles', { ...profile, username: slug, slug, account_state });
    }
    const merged = await ctx.db.insert('profiles', { ...profile, username: 'cy', slug: 'cy', account_state: 'active' });
    await ctx.db.patch(merged, { merged_into_profile_id: merged });
    const group = { created_at: stamp.created_at, created_by: owner };
    await ctx.db.insert('groups', { ...group, name: 'Spice', slug: 'spice', is_deleted: false });
    await ctx.db.insert('groups', { ...group, name: 'Old', slug: 'old-group', is_deleted: true });
  });
  const paths = async (collection: string) =>
    (await t.query(api.publicSitemap.page, { collection, cursor: null })).entries.map((entry) => entry.pathname);

  expect(await paths('rulesets')).toEqual(['/rulesets/dream']);
  expect(await paths('rulebooks')).toEqual(['/rulesets/dream/rulebooks/core']);
  expect(await paths('faq')).toEqual(['/rulesets/dream/faq/storm-order']);
  expect(await paths('profiles')).toEqual(['/profiles/ana']);
  expect(await paths('groups')).toEqual(['/groups/spice']);
  await expect(t.query(api.publicSitemap.page, { collection: 'rulesets', cursor: null })).resolves.toMatchObject({
    entries: [{ lastmod: '2026-03-03T00:00:00.000Z' }],
  });
  await expect(t.query(api.publicSitemap.page, { collection: 'groups', cursor: null })).resolves.toMatchObject({
    entries: [{ lastmod: null }],
  });
});

test('record sitemap names stay clear of Asset type names', () => {
  expect(SITEMAP_RECORD_COLLECTIONS.filter((name) => (ASSET_TYPE_KEYS as string[]).includes(name))).toEqual([]);
});

test('asset entries name only the generated images their page shows as its own', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const owner_id = await ctx.db.insert('users', { name: 'Owner' });
    const row = { owner_id, group_id: null, is_deleted: false, created_at: 'x', updated_at: 'x' };
    await ctx.db.insert('assets', {
      ...row,
      type: 'token-plate',
      slug: 'two-sided',
      data: { back: { mode: 'custom' } },
    });
    await ctx.db.insert('assets', { ...row, type: 'deck', slug: 'authored', data: { cardback: { mode: 'custom' } } });
    await ctx.db.insert('assets', { ...row, type: 'deck', slug: 'preset', data: { cardback: { mode: 'preset' } } });
    await ctx.db.insert('assets', { ...row, type: 'bundle', slug: 'pile', data: {} });
  });
  const images = async (collection: string) =>
    (await t.query(api.publicSitemap.page, { collection, cursor: null })).entries.map((entry) => [
      entry.pathname,
      entry.images?.map((image) => image.replace(/\/\d[0-9a-z_]+(\.back)?\//, '/<id>$1/')),
    ]);
  expect(await images('token-plate')).toEqual([
    [
      '/assets/token-plate/two-sided',
      ['/published/square-tokens/<id>/token.jpg?v=x', '/published/square-tokens/<id>.back/token.jpg?v=x'],
    ],
  ]);
  expect(await images('deck')).toEqual([
    ['/assets/deck/authored', ['/published/decks/<id>/cardback.jpg?v=x']],
    ['/assets/deck/preset', undefined],
  ]);
  expect(await images('bundle')).toEqual([['/assets/bundle/pile', undefined]]);
});
