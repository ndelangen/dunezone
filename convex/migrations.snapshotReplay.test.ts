/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, describe, expect, test, vi } from 'vitest';

import { placeholderOwner } from '../scripts/lib/snapshot-policy';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { factionTest } from './factions.test.fixture';
import guards from './migration-guards.json';

/** The migrations `migration-guards.ts dev-strict` starts after every snapshot load, in the order it starts them. */
const required = guards.entries
  .filter((entry) => entry.phase === 'widen')
  .map((entry) => entry.id)
  .sort();

const STAMP = '2026-10-01T00:00:00.000Z';

const composition = {
  name: 'Spice',
  image: '/vector/decal/amal.svg',
  imageOffset: [0, 0],
  imageScale: 1,
  background: {},
};

/* A decal the vector-train retune scaled by 1.5625 in production, stored at its retuned scale. */
const retunedDecal = {
  id: '/vector/decal/carryalls.svg',
  muted: false,
  outline: false,
  scale: 0.5,
  offset: [0, 0],
};

afterEach(() => vi.useRealTimers());

describe('a snapshot load', () => {
  test('replays every required migration over rows production already migrated, changing none and rebuilding the aggregates', async () => {
    vi.useFakeTimers();
    const t = factionTest();

    /* Rows go in through the raw database, the way the import writes them: no trigger runs, so every aggregate starts empty. */
    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', placeholderOwner.user());
      await ctx.db.insert('profiles', placeholderOwner.profile(ownerId));
      const owned = { owner_id: ownerId, group_id: null, is_deleted: false, created_at: STAMP, updated_at: STAMP };
      const deck = (slug: string, cardback: unknown) =>
        ctx.db.insert('assets', { ...owned, type: 'deck', slug, data: { name: slug, about: '', cardback } });
      const custom = await deck('custom', { mode: 'custom', ...composition });
      return [
        custom,
        await deck('preset', { mode: 'preset', key: 'spice' }),
        await deck('reference', { mode: 'reference', asset_id: custom }),
        await ctx.db.insert('factions', {
          ...owned,
          slug: 'retuned',
          data: { ...assetPublishingFaction, decals: [retunedDecal] },
        }),
      ] as const;
    });
    const rows = () => t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get(id))));
    const loaded = await rows();

    await t.mutation(internal.migrations.runRequired, { ids: required });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(t.query(internal.migrations.assertReadyForNarrow, { required })).resolves.toMatchObject({ ok: true });
    expect(await rows()).toEqual(loaded);
    expect((await t.query(api.homepage.get, {})).community.counts).toMatchObject({ factions: 1, members: 1 });
  });
});
