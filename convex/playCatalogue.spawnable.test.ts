/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { SPAWN_PICKER_STEP } from '../src/shared/play/inventory';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

type Owner = 'stilgar' | 'chani' | 'departed';
type Seeded = { type: string; name: string; owner?: Owner; deleted?: boolean };

const STAMP = '2026-10-01T00:00:00.000Z';

/* Assets written through the triggers, as every real write is, so the catalogue's search entries follow; insertion order is creation order. */
async function seedAssets(t: ReturnType<typeof applicationTest>, assets: Seeded[]) {
  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const owners: Record<Owner, Id<'users'>> = {
      stilgar: await ctx.db.insert('users', { name: 'Stilgar' }),
      chani: await ctx.db.insert('users', { name: 'Chani' }),
      departed: await ctx.db.insert('users', { name: 'Departed' }),
    };
    for (const [username, user_id] of Object.entries(owners)) {
      await ctx.db.insert('profiles', {
        user_id,
        username,
        avatar_url: null,
        /* A departed owner's profile is no longer active, so the picker names nobody. */
        account_state: username === 'departed' ? 'deleted' : 'active',
        slug: username,
        created_at: STAMP,
        updated_at: STAMP,
      });
    }
    for (const asset of assets) {
      await ctx.db.insert('assets', {
        owner_id: owners[asset.owner ?? 'stilgar'],
        group_id: null,
        is_deleted: asset.deleted ?? false,
        type: asset.type,
        slug: asset.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
        data: { name: asset.name },
        created_at: STAMP,
        updated_at: STAMP,
      });
    }
  });
}

const names = (answer: { entries: { name: string }[] }) => answer.entries.map((entry) => entry.name);

describe('the spawn picker reads the catalogue', () => {
  test('newest first across the spawnable types, leaving out other types and deleted assets, one row past the limit', async () => {
    const t = applicationTest();
    await seedAssets(t, [
      { type: 'deck', name: 'Oldest Deck' },
      { type: 'card-treachery', name: 'Lasgun' },
      { type: 'token-disc', name: 'Karama' },
      { type: 'bundle', name: 'Deleted Bundle', deleted: true },
      { type: 'token-enhance', name: 'Kwisatz Haderach' },
      { type: 'board', name: 'Arrakis' },
      { type: 'deck', name: 'Newest Deck' },
    ]);
    const all = await t.query(api.playCatalogue.spawnableAssets, {});
    expect(names(all)).toEqual(['Newest Deck', 'Kwisatz Haderach', 'Karama', 'Oldest Deck']);
    expect(all).toMatchObject({ hasMore: false, capped: false });
    expect(all.entries[0]).toEqual({ type: 'deck', slug: 'newest-deck', name: 'Newest Deck', owner: 'stilgar' });

    const two = await t.query(api.playCatalogue.spawnableAssets, { limit: 2 });
    expect(names(two)).toEqual(['Newest Deck', 'Kwisatz Haderach']);
    expect(two.hasMore).toBe(true);
  });

  test('a search finds spawnable assets by their own name or their owner, and never a card', async () => {
    const t = applicationTest();
    await seedAssets(t, [
      { type: 'card-treachery', name: 'Treachery Card' },
      { type: 'deck', name: 'House Treachery' },
      { type: 'token-disc', name: 'Karama', owner: 'chani' },
      { type: 'token-tech', name: 'Spice Harvester', owner: 'chani' },
    ]);
    const byName = await t.query(api.playCatalogue.spawnableAssets, { q: 'treachery' });
    expect(names(byName)).toEqual(['House Treachery']);
    expect(byName).toMatchObject({ hasMore: false, capped: false });

    const byOwner = await t.query(api.playCatalogue.spawnableAssets, { q: 'chani', limit: 1 });
    expect(byOwner.entries).toHaveLength(1);
    expect(byOwner.entries[0]?.owner).toBe('chani');
    expect(byOwner.hasMore).toBe(true);

    const nothing = await t.query(api.playCatalogue.spawnableAssets, { q: 'sardaukar' });
    expect(nothing).toEqual({ entries: [], hasMore: false, capped: false });
  });

  test('an inactive owner names nobody, and an entry whose asset is gone is dropped', async () => {
    const t = applicationTest();
    await seedAssets(t, [
      { type: 'token-plate', name: 'Orphaned Plate' },
      { type: 'token-disc', name: 'Abandoned Disc', owner: 'departed' },
    ]);
    /* The asset goes without its triggers, as a drifted catalogue would have it: the entry stays, its source does not. */
    await t.run(async (ctx) => {
      const plate = await ctx.db
        .query('assets')
        .filter((q) => q.eq(q.field('slug'), 'orphaned-plate'))
        .unique();
      await ctx.db.delete('assets', plate!._id);
    });
    const searched = await t.query(api.playCatalogue.spawnableAssets, { q: 'orphaned' });
    expect(searched.entries).toEqual([]);
    const abandoned = await t.query(api.playCatalogue.spawnableAssets, { q: 'abandoned' });
    expect(abandoned.entries).toEqual([
      { type: 'token-disc', slug: 'abandoned-disc', name: 'Abandoned Disc', owner: null },
    ]);
    const browsed = await t.query(api.playCatalogue.spawnableAssets, {});
    expect(names(browsed)).toEqual(['Abandoned Disc']);
  });

  test('the newest list stops at the search ceiling and says so', async () => {
    const t = applicationTest();
    const ceiling = SPAWN_PICKER_STEP * 10;
    await seedAssets(
      t,
      Array.from({ length: ceiling + 1 }, (_, index) => ({ type: 'token-disc', name: `Token ${index + 1}` }))
    );
    const answer = await t.query(api.playCatalogue.spawnableAssets, { limit: ceiling + SPAWN_PICKER_STEP });
    expect(answer.entries).toHaveLength(ceiling);
    expect(answer).toMatchObject({ hasMore: false, capped: true });
  });
});
