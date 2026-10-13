/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

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
    entries: [{ pathname: '/assets/token-disc/same-name', lastmod: '2026-02-02T00:00:00.000Z' }],
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
    await ctx.db.insert('rulebooks', {
      ...rulebook,
      ruleset_id: live,
      name: 'Core',
      name_key: 'core',
      slug: 'core',
      is_deleted: false,
    });
    await ctx.db.insert('rulebooks', {
      ...rulebook,
      ruleset_id: live,
      name: 'Old',
      name_key: 'old',
      slug: 'old',
      is_deleted: true,
    });
    await ctx.db.insert('rulebooks', {
      ...rulebook,
      ruleset_id: gone,
      name: 'Orphan',
      name_key: 'orphan',
      slug: 'orphan',
      is_deleted: false,
    });
    const faq = { ...stamp, question: 'Q?', asked_by: owner, accepted_answer_id: null };
    await ctx.db.insert('faq_items', { ...faq, ruleset_id: live, slug: 'storm-order' });
    await ctx.db.insert('faq_items', { ...faq, ruleset_id: gone, slug: 'hidden' });
    const profile = { ...stamp, user_id: owner, avatar_url: null };
    await ctx.db.insert('profiles', { ...profile, username: 'ana', slug: 'ana', account_state: 'active' });
    await ctx.db.insert('profiles', { ...profile, username: 'bo', slug: 'bo', account_state: 'deleted' });
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
