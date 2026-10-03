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
  await expect(t.query(api.publicSitemap.page, { collection: 'board', cursor: null })).rejects.toThrow();
});
