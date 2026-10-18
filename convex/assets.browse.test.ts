/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import type { FunctionReturnType } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { ASSET_CATALOGUE_PAGE_SIZE } from '../src/shared/assets/catalogueSearch';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { storedProfileAvatar } from './profiles.test.fixture';

const tokenFace = () => ({
  image: '/vector/icon/projectile.svg',
  background: {
    image: '/image/texture/015.jpg',
    colors: ['#4B4C0D', '#262B04'],
    invert: true,
    definition: 0,
    influence: 0.5,
  },
  symbolScale: 1,
  top: 'AXLOTL',
  bottomFirst: 'TANKS',
  bottomSecond: '',
  ring: false,
});

const tokenData = (name: string) => ({
  name,
  about: '',
  front: tokenFace(),
  back: { mode: 'custom', face: tokenFace() },
});

/* A profile written raw, as sign-up leaves it, so the owner has a name to be found by. */
async function seedOwner(t: ReturnType<typeof applicationTest>, username: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { account_state: 'active' });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username,
      slug: username.toLowerCase(),
      ...storedProfileAvatar,
      account_state: 'active',
      created_at: '2026-10-10T00:00:00.000Z',
      updated_at: '2026-10-10T00:00:00.000Z',
    });
    return userId;
  });
}

async function createTokens(t: ReturnType<typeof applicationTest>, ownerId: string, names: string[]) {
  const owner = t.withIdentity({ subject: ownerId });
  const created = [];
  for (const name of names) {
    created.push(await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData(name) }));
  }
  return created;
}

const names = (page: { entries: { name: string }[] }) => page.entries.map((entry) => entry.name);

/** The searched shape, which a search with a limit answers with. */
function searched(answer: FunctionReturnType<typeof api.assets.catalogue>) {
  if (!('mode' in answer)) {
    throw new Error('Expected a search, got a browsed page.');
  }
  return answer;
}

describe('the asset type catalogue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('pages one type newest first, counts it, and keeps other types out', async () => {
    const t = applicationTest();
    const ownerId = await seedOwner(t, 'Chani');
    const tokens = Array.from({ length: ASSET_CATALOGUE_PAGE_SIZE + 2 }, (_, index) => `Token ${index + 1}`);
    await createTokens(t, ownerId, tokens);
    await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.create, { type: 'token-tech', data: tokenData('Tech') });

    const first = await t.query(api.assets.catalogue, { type: 'token-disc' });
    expect(first).toMatchObject({
      total: tokens.length,
      typeTotal: tokens.length,
      page: 1,
      pageCount: 2,
      complete: true,
    });
    expect(first.entries).toHaveLength(ASSET_CATALOGUE_PAGE_SIZE);
    expect(first.entries[0]!.name).toBe(`Token ${tokens.length}`);

    const second = await t.query(api.assets.catalogue, { type: 'token-disc', page: 2 });
    expect(names(second)).toEqual(['Token 2', 'Token 1']);

    const past = await t.query(api.assets.catalogue, { type: 'token-disc', page: 9 });
    expect(past).toMatchObject({ entries: [], page: 9, pageCount: 2 });
  });

  test('sorts by name and by last update', async () => {
    const t = applicationTest();
    const ownerId = await seedOwner(t, 'Chani');
    const [shield] = await createTokens(t, ownerId, ['Shield', 'Lasgun', 'Snooper']);
    vi.advanceTimersByTime(1000);
    await t
      .withIdentity({ subject: ownerId })
      .mutation(api.assets.update, { id: shield!.id, data: tokenData('Shield') });

    expect(names(await t.query(api.assets.catalogue, { type: 'token-disc', sort: 'name' }))).toEqual([
      'Lasgun',
      'Shield',
      'Snooper',
    ]);
    expect(names(await t.query(api.assets.catalogue, { type: 'token-disc', sort: 'updated' }))[0]).toBe('Shield');
  });

  test('finds an asset by every word of its name, or by its owner, and follows a rename of the owner', async () => {
    const t = applicationTest();
    const chani = await seedOwner(t, 'Chani');
    const stilgar = await seedOwner(t, 'Stilgar');
    await createTokens(t, chani, ['Shield Snooper', 'Shield']);
    await createTokens(t, stilgar, ['Lasgun']);

    const search = (q: string) => t.query(api.assets.catalogue, { type: 'token-disc', q, sort: 'name' });
    expect(names(await search('shield snoop'))).toEqual(['Shield Snooper']);
    expect(names(await search('stil'))).toEqual(['Lasgun']);
    expect(await search('fremen')).toMatchObject({ entries: [], total: 0, typeTotal: 3 });

    await t.withIdentity({ subject: stilgar }).mutation(api.profiles.updateCurrent, {
      username: 'NaibOfTabr',
      avatar_url: storedProfileAvatar.avatar_url,
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(names(await search('naibof'))).toEqual(['Lasgun']);
    expect(names(await search('stilgar'))).toEqual([]);
  });

  test('answers a search of more words than the search index takes, rather than failing the page', async () => {
    const t = applicationTest();
    const ownerId = await seedOwner(t, 'Chani');
    const words = Array.from({ length: 18 }, (_, index) => `w${index}`);
    await createTokens(t, ownerId, [words.join(' '), 'Shield']);

    const found = await t.query(api.assets.catalogue, { type: 'token-disc', q: words.join(' ') });
    expect(names(found)).toEqual([words.join(' ')]);
    expect(await t.query(api.assets.catalogue, { type: 'token-disc', q: `${words.join(' ')} missing` })).toMatchObject({
      total: 0,
    });
  });

  test('a search with a limit loads more by asking for a larger one, best matches first and only ever appending', async () => {
    const t = applicationTest();
    const chani = await seedOwner(t, 'Chani');
    const stilgar = await seedOwner(t, 'Stilgar');
    const count = ASSET_CATALOGUE_PAGE_SIZE + 2;
    await createTokens(
      t,
      chani,
      Array.from({ length: count }, (_, index) => `Shield ${index + 1}`)
    );
    await createTokens(t, stilgar, ['Lasgun']);

    const first = searched(
      await t.query(api.assets.catalogue, { type: 'token-disc', q: 'shield', limit: ASSET_CATALOGUE_PAGE_SIZE })
    );
    expect(first).toMatchObject({
      mode: 'search',
      hasMore: true,
      capped: false,
      limit: ASSET_CATALOGUE_PAGE_SIZE,
      typeTotal: count + 1,
    });
    expect(first.entries).toHaveLength(ASSET_CATALOGUE_PAGE_SIZE);
    expect(first).not.toHaveProperty('total');
    expect(first).not.toHaveProperty('page');

    const more = searched(
      await t.query(api.assets.catalogue, { type: 'token-disc', q: 'shield', limit: ASSET_CATALOGUE_PAGE_SIZE * 2 })
    );
    expect(more).toMatchObject({ hasMore: false, limit: ASSET_CATALOGUE_PAGE_SIZE * 2 });
    expect(more.entries).toHaveLength(count);
    expect(more.entries.slice(0, ASSET_CATALOGUE_PAGE_SIZE).map((entry) => entry.id)).toEqual(
      first.entries.map((entry) => entry.id)
    );
    expect(names(searched(await t.query(api.assets.catalogue, { type: 'token-disc', q: 'stil', limit: 24 })))).toEqual([
      'Lasgun',
    ]);

    /* An old bundle's search, with a page and no limit, still gets the paged shape it reads. */
    const old = await t.query(api.assets.catalogue, { type: 'token-disc', q: 'shield', page: 2, sort: 'name' });
    expect(old).toMatchObject({ page: 2, pageCount: 2, total: count, typeTotal: count + 1, complete: true });
    expect(old).not.toHaveProperty('mode');
    expect(names(old)).toEqual(['Shield 8', 'Shield 9']);
  });

  test('drops a deleted asset from its list and its count', async () => {
    const t = applicationTest();
    const ownerId = await seedOwner(t, 'Chani');
    const [shield] = await createTokens(t, ownerId, ['Shield', 'Lasgun']);
    await t.withIdentity({ subject: ownerId }).mutation(api.assets.softDelete, { id: shield!.id });

    expect(await t.query(api.assets.catalogue, { type: 'token-disc' })).toMatchObject({ total: 1, typeTotal: 1 });
    await expect(t.query(internal.catalogueMaintenance.catalogueDrift, { kind: 'asset' })).resolves.toMatchObject({
      missing: [],
      stale: [],
      orphaned: [],
      overcounted: [],
    });
  });
});
