/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const created = '2026-07-01T00:00:00.000Z';

test('a profile link carries the stored avatar, falls back to the legacy URL, and hides non-public profiles', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const base = { avatar_url: 'https://cdn.example/legacy.png', created_at: created, updated_at: created };
    await ctx.db.insert('profiles', {
      ...base,
      user_id: await ctx.db.insert('users', { name: 'Central' }),
      username: 'Central',
      slug: 'central',
      account_state: 'active',
      avatar: { url: 'https://dune.zone/user-images/stored.jpg', source_url: base.avatar_url, width: 320, height: 320 },
    });
    await ctx.db.insert('profiles', {
      ...base,
      user_id: await ctx.db.insert('users', { name: 'Legacy' }),
      username: 'Legacy',
      slug: 'legacy',
      account_state: 'active',
    });
    await ctx.db.insert('profiles', {
      ...base,
      user_id: await ctx.db.insert('users', { name: 'Leaving' }),
      username: 'Leaving',
      slug: 'leaving',
      account_state: 'deletion_pending',
    });
  });

  expect(await t.query(api.profiles.linkBySlug, { slug: 'central' })).toEqual({
    slug: 'central',
    username: 'Central',
    image: 'https://dune.zone/user-images/stored.jpg',
  });
  expect((await t.query(api.profiles.linkBySlug, { slug: 'legacy' }))?.image).toBe('https://cdn.example/legacy.png');
  expect(await t.query(api.profiles.linkBySlug, { slug: 'leaving' })).toBeNull();
  expect(await t.query(api.profiles.linkBySlug, { slug: 'nobody' })).toBeNull();
});
