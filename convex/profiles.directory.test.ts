/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { PROFILE_CATALOGUE_PAGE_SIZE } from '../src/shared/profiles/catalogueSearch';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

type Profile = {
  username: string | null;
  slug: string;
  createdAt?: string;
  accountState?: 'active' | 'deleted';
};

/* Profiles written through the triggers, as every real write is, so the directory's entries follow. */
async function seedProfiles(t: ReturnType<typeof applicationTest>, profiles: Profile[]) {
  return await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const ids: Id<'profiles'>[] = [];
    for (const profile of profiles) {
      const userId = await ctx.db.insert('users', {});
      const createdAt = profile.createdAt ?? '2026-10-01T00:00:00.000Z';
      ids.push(
        await ctx.db.insert('profiles', {
          user_id: userId,
          username: profile.username,
          avatar_url: null,
          account_state: profile.accountState ?? 'active',
          slug: profile.slug,
          created_at: createdAt,
          updated_at: createdAt,
        })
      );
    }
    return ids;
  });
}

const names = (page: { entries: { name: string }[] }) => page.entries.map((entry) => entry.name);

describe('the profile directory', () => {
  test('pages every public profile A to Z, counts them, and leaves deleted and merged ones out', async () => {
    const t = applicationTest();
    const listed = Array.from({ length: PROFILE_CATALOGUE_PAGE_SIZE + 2 }, (_, index) => ({
      username: `Fremen ${String(index + 1).padStart(2, '0')}`,
      slug: `fremen-${index + 1}`,
    }));
    const [keeper] = await seedProfiles(t, [
      ...listed,
      { username: 'Gone', slug: 'gone', accountState: 'deleted' },
      { username: 'Folded', slug: 'folded' },
    ]);
    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const folded = await ctx.db
        .query('profiles')
        .withIndex('by_slug', (q) => q.eq('slug', 'folded'))
        .unique();
      await ctx.db.patch(folded!._id, { merged_into_profile_id: keeper });
    });

    const first = await t.query(api.profiles.catalogue, {});
    expect(first).toMatchObject({
      total: listed.length,
      directoryTotal: listed.length,
      complete: true,
      page: 1,
      pageCount: 2,
      pageSize: PROFILE_CATALOGUE_PAGE_SIZE,
    });
    expect(names(first)).toEqual(listed.slice(0, PROFILE_CATALOGUE_PAGE_SIZE).map((profile) => profile.username));
    expect(names(await t.query(api.profiles.catalogue, { page: 2 }))).toEqual(['Fremen 25', 'Fremen 26']);
    expect((await t.query(api.profiles.catalogue, { page: 3 })).entries).toEqual([]);
  });

  test('orders newest first on request, and goes by the slug when no username was chosen', async () => {
    const t = applicationTest();
    await seedProfiles(t, [
      { username: 'Stilgar', slug: 'stilgar', createdAt: '2026-01-01T00:00:00.000Z' },
      { username: null, slug: 'nameless-one', createdAt: '2026-03-01T00:00:00.000Z' },
      { username: 'Chani', slug: 'chani', createdAt: '2026-02-01T00:00:00.000Z' },
    ]);

    expect(names(await t.query(api.profiles.catalogue, {}))).toEqual(['Chani', 'nameless-one', 'Stilgar']);
    expect(names(await t.query(api.profiles.catalogue, { sort: 'newest' }))).toEqual([
      'nameless-one',
      'Chani',
      'Stilgar',
    ]);
  });

  test('finds a profile by username or slug, and counts the directory apart from the matches', async () => {
    const t = applicationTest();
    await seedProfiles(t, [
      { username: 'Liet Kynes', slug: 'planetologist' },
      { username: 'Stilgar', slug: 'stilgar' },
    ]);

    const byName = await t.query(api.profiles.catalogue, { q: 'kynes' });
    expect(names(byName)).toEqual(['Liet Kynes']);
    expect(byName).toMatchObject({ total: 1, directoryTotal: 2 });
    expect(names(await t.query(api.profiles.catalogue, { q: 'planetologist' }))).toEqual(['Liet Kynes']);
    expect((await t.query(api.profiles.catalogue, { q: 'harkonnen' })).total).toBe(0);
  });

  test('follows a rename and an account deletion, and leaves no drift', async () => {
    const t = applicationTest();
    const [stilgar] = await seedProfiles(t, [
      { username: 'Stilgar', slug: 'stilgar' },
      { username: 'Chani', slug: 'chani' },
    ]);

    await t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.patch(stilgar, { username: 'Naib of Tabr' });
    });
    expect(names(await t.query(api.profiles.catalogue, { q: 'naib' }))).toEqual(['Naib of Tabr']);
    expect(names(await t.query(api.profiles.catalogue, {}))).toEqual(['Chani', 'Naib of Tabr']);

    await t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.patch(stilgar, { account_state: 'deleted' });
    });
    expect(names(await t.query(api.profiles.catalogue, {}))).toEqual(['Chani']);

    const drift = await t.query(internal.catalogueMaintenance.catalogueDrift, { kind: 'profile' });
    expect(drift).toMatchObject({ missing: [], stale: [], duplicated: [], unordered: [], orphaned: [] });
  });

  test('backfills profiles written before the directory existed', async () => {
    const t = applicationTest();
    const profileId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {});
      return await ctx.db.insert('profiles', {
        user_id: userId,
        username: 'Old Timer',
        avatar_url: null,
        account_state: 'active',
        slug: 'old-timer',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      });
    });
    expect((await t.query(api.profiles.catalogue, {})).total).toBe(0);

    await t.mutation(internal.migrations.catalogue_entries_profiles_v1, {});
    expect(names(await t.query(api.profiles.catalogue, {}))).toEqual(['Old Timer']);
    await t.mutation(internal.migrations.catalogue_entries_profiles_verify_v1, {});
    expect((await t.query(api.profiles.catalogue, {})).entries.map((entry) => entry.id)).toEqual([profileId]);
  });
});
