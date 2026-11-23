/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { publishingCustomCard } from '../src/shared/assets/fixtures/publishingCustomCard';
import { publishingRectangleTokenFace } from '../src/shared/assets/fixtures/publishingRectangleTokenFace';
import { DUKE_PRAD_VIDAL_TOKEN } from '../src/shared/assets/leaderToken';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { LAYER_SWAPS } from './enhanceRetirementMigrations';
import { variantsFixture } from './factionVariants.test.fixture';

/* A faction whose Extras list an enhance token beside a leader token, as GF9 Atreides did before #2995. */
async function retirementFixture() {
  const f = await variantsFixture();
  migrationsTest.register(f.t);
  const insertAsset = (type: string, slug: string, data: unknown) =>
    f.t.run(
      async (ctx) =>
        await ctx.db.insert('assets', {
          owner_id: (await ctx.db.get(f.root._id))!.owner_id,
          type,
          data,
          slug,
          created_at: '2026-11-23T00:00:00.000Z',
          updated_at: '2026-11-23T00:00:00.000Z',
          is_deleted: false,
          group_id: null,
        })
    );
  const enhanceData = (name: string) => ({
    name,
    about: '',
    front: publishingRectangleTokenFace,
    back: { mode: 'same' },
  });
  const enhance = await insertAsset('token-enhance', 'kwizatz-haderach', enhanceData('Kwizatz Haderach'));
  const peace = await insertAsset('token-enhance', 'peace', enhanceData('Peace'));
  const leader = await insertAsset('token-leader', 'kwisatz-haderach', DUKE_PRAD_VIDAL_TOKEN);
  const layer = (asset_id: string, scale: number) => ({
    kind: 'token',
    layerId: crypto.randomUUID(),
    asset_id,
    offset: [120, 40],
    scale,
    opacity: 1,
    rotation: 5,
  });
  const card = await insertAsset('card-custom', 'kwisatz-haderach', {
    ...publishingCustomCard,
    layers: [layer(leader, 1), layer(enhance, 0.5), layer(peace, 0.5)],
  });
  const bundle = await insertAsset('bundle', 'peace-tokens', { name: 'Peace tokens' });
  const mixed = await insertAsset('bundle', 'mixed', { name: 'Mixed' });
  await f.t.run(async (ctx) => {
    await ctx.db.insert('asset_relations', {
      from_asset_id: bundle,
      to_asset_id: peace,
      kind: 'bundle-token',
      count: 5,
    });
    await ctx.db.insert('asset_relations', {
      from_asset_id: mixed,
      to_asset_id: peace,
      kind: 'bundle-token',
      count: 1,
    });
    await ctx.db.insert('asset_relations', {
      from_asset_id: mixed,
      to_asset_id: leader,
      kind: 'bundle-token',
      count: 1,
    });
  });
  const extras = [
    { type: 'token-enhance', slug: 'kwizatz-haderach' },
    { type: 'token-leader', slug: 'kwisatz-haderach' },
  ];
  await f.t.run(async (ctx) => {
    const row = (await ctx.db.get(f.root._id))!;
    await ctx.db.patch(f.root._id, { data: { ...row.data, extras } });
  });
  const asset = (id: Id<'assets'>) => f.t.run(async (ctx) => (await ctx.db.get(id))!);
  const migrate = async (options: { reset?: boolean } = {}) => {
    await f.t.mutation(internal.enhanceRetirementMigrations.enhance_retire_1_cards_v1, options);
    await f.t.mutation(internal.enhanceRetirementMigrations.enhance_retire_2_bundles_v1, options);
    await f.t.mutation(internal.enhanceRetirementMigrations.enhance_retire_3_extras_v1, options);
    await f.t.mutation(internal.enhanceRetirementMigrations.enhance_retire_4_tokens_v1, options);
    await f.settle();
  };
  return { ...f, enhance, peace, leader, card, bundle, mixed, asset, migrate };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('retiring enhance tokens (#3013)', () => {
  test('swaps the Kwisatz Haderach card’s enhance token for the leader token, on production’s ids', () => {
    expect([...LAYER_SWAPS]).toEqual([['ns78mth8xp26cpkaw1t4gc0es58cwx0p', 'ns7e5v288s7hab7fewjpmyqzx58gq6wk']]);
  });

  test('swaps a named enhance layer for its leader at the same height, drops any other, and deletes a bundle left empty', async () => {
    const f = await retirementFixture();
    (LAYER_SWAPS as Map<string, string>).set(f.enhance, f.leader);
    try {
      await f.migrate();
    } finally {
      (LAYER_SWAPS as Map<string, string>).delete(f.enhance);
    }

    const layers = ((await f.asset(f.card)).data as { layers: { asset_id: string; scale: number; offset: number[] }[] })
      .layers;
    expect(layers.map(({ asset_id, scale, offset }) => ({ asset_id, scale, offset }))).toEqual([
      { asset_id: f.leader, scale: 1, offset: [120, 40] },
      { asset_id: f.leader, scale: 0.5 * (186 / 300), offset: [120, 40] },
    ]);
    const links = await f.t.run(async (ctx) =>
      ctx.db
        .query('asset_relations')
        .withIndex('by_from_kind', (q) => q.eq('from_asset_id', f.card).eq('kind', 'custom-card-token'))
        .collect()
    );
    expect(links.map((link) => link.to_asset_id)).toEqual([f.leader]);
    expect(await f.asset(f.bundle)).toMatchObject({ is_deleted: true });
    expect(await f.asset(f.mixed)).toMatchObject({ is_deleted: false });
    expect(await f.asset(f.peace)).toMatchObject({ is_deleted: true });
  });

  test('takes them out of faction Extras and deletes them, leaving every other token; a replay changes nothing', async () => {
    const f = await retirementFixture();
    await f.migrate();

    expect((await f.data(f.root._id)).extras).toEqual([{ type: 'token-leader', slug: 'kwisatz-haderach' }]);
    expect(await f.asset(f.enhance)).toMatchObject({ is_deleted: true });
    expect(await f.asset(f.leader)).toMatchObject({ is_deleted: false });

    const faction = await f.row(f.root._id);
    const token = await f.asset(f.enhance);
    await f.migrate({ reset: true });
    expect(await f.row(f.root._id)).toEqual(faction);
    expect(await f.asset(f.enhance)).toEqual(token);
  });
});
