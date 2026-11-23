/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { arrakisBoard } from '../src/shared/boards/geometry';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

const at = '2026-10-21T00:00:00.000Z';

/* A full board definition is far past this budget, so reading the board below would fail the page. */
async function sharedSlugFixture() {
  const t = applicationTest({ transactionLimits: { bytesRead: 64 * 1024 } });
  await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { name: 'Owner' });
    await ctx.db.insert('profiles', {
      user_id: owner,
      username: 'Owner',
      slug: 'owner',
      avatar_url: null,
      account_state: 'active',
      created_at: at,
      updated_at: at,
    });
    const row = { owner_id: owner, group_id: null, slug: 'dune', is_deleted: false, created_at: at, updated_at: at };
    await ctx.db.insert('assets', { ...row, type: 'board', data: { name: 'Dune', about: '', board: arrakisBoard() } });
    await ctx.db.insert('assets', { ...row, type: 'card-treachery', is_deleted: true, data: { name: 'Old Dune' } });
    await ctx.db.insert('assets', { ...row, type: 'card-treachery', data: { name: 'Dune' } });
  });
  return t;
}

test('an asset page reads only assets of its own type that share its slug', async () => {
  const t = await sharedSlugFixture();
  const page = await t.query(api.assets.page, { type: 'card-treachery', slug: 'dune' });
  expect(page?.asset.name).toBe('Dune');
});
